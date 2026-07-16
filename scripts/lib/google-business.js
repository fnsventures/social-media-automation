import { google } from "googleapis";
import { config } from "./config.js";

const MYBUSINESS_BASE = "https://mybusiness.googleapis.com/v4";
const BUSINESS_INFO_BASE = "https://mybusinessbusinessinformation.googleapis.com/v1";
const SUMMARY_MAX = 1500;

export const SOCIAL_URL_ATTRIBUTES = {
  facebook: "attributes/url_facebook",
  instagram: "attributes/url_instagram",
  youtube: "attributes/url_youtube",
  linkedin: "attributes/url_linkedin",
  pinterest: "attributes/url_pinterest",
  twitter: "attributes/url_twitter",
};

function createOAuth2Client() {
  const { clientId, clientSecret, refreshToken } = config.googleBusiness;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "Google Business credentials missing. Run npm run setup:google-business."
    );
  }

  const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
  oauth2.setCredentials({ refresh_token: refreshToken });
  return oauth2;
}

export function googleBusinessMediaBaseConfigured() {
  return Boolean(config.googleBusiness.mediaBaseUrl);
}

export function resolvePublicMediaUrl(relativePath) {
  const base = config.googleBusiness.mediaBaseUrl;
  if (!base) {
    throw new Error(
      "Google Business image posts need GOOGLE_BUSINESS_MEDIA_BASE_URL " +
        "(public URL prefix for media/ files, e.g. https://raw.githubusercontent.com/owner/repo/master)."
    );
  }

  const normalized = String(relativePath).replace(/^\/+/, "");
  return `${base.replace(/\/+$/, "")}/${normalized}`;
}

function normalizeLocationName(locationName) {
  const value = String(locationName).trim();
  if (value.startsWith("accounts/") && value.includes("/locations/")) {
    return value;
  }
  throw new Error(
    "GOOGLE_BUSINESS_LOCATION_NAME must look like accounts/{accountId}/locations/{locationId}."
  );
}

function getLocationId() {
  const parent = normalizeLocationName(config.googleBusiness.locationName);
  return parent.split("/locations/").pop();
}

function buildUriAttribute(attributeName, uri) {
  return {
    name: attributeName,
    values: [],
    uriValues: [{ uri }],
  };
}

export async function getLocationSocialLinks() {
  const oauth2 = createOAuth2Client();
  const locationId = getLocationId();

  const response = await oauth2.request({
    url: `${BUSINESS_INFO_BASE}/locations/${locationId}/attributes`,
  });

  const attributes = response.data?.attributes ?? [];
  const socialNames = new Set(Object.values(SOCIAL_URL_ATTRIBUTES));
  const links = {};

  for (const attribute of attributes) {
    if (!socialNames.has(attribute.name)) continue;
    const uri = attribute.uriValues?.[0]?.uri;
    if (uri) links[attribute.name] = uri;
  }

  return links;
}

export async function updateLocationSocialLinks(links) {
  const entries = Object.entries(links).filter(([, uri]) => Boolean(uri?.trim()));
  if (entries.length === 0) {
    throw new Error("No social profile URLs provided to update.");
  }

  const oauth2 = createOAuth2Client();
  const locationId = getLocationId();
  const attributes = entries.map(([attributeName, uri]) =>
    buildUriAttribute(attributeName, uri.trim())
  );
  const attributeMask = attributes.map((attribute) => attribute.name).join(",");

  const response = await oauth2.request({
    url: `${BUSINESS_INFO_BASE}/locations/${locationId}/attributes`,
    method: "PATCH",
    params: { attributeMask },
    data: {
      name: `locations/${locationId}/attributes`,
      attributes,
    },
  });

  return response.data?.attributes ?? [];
}

/** Remove social link attributes (omit them from the attributes body, include in mask). */
export async function removeLocationSocialLinks(attributeNames) {
  const names = attributeNames.filter(Boolean);
  if (names.length === 0) {
    throw new Error("No social profile attributes provided to remove.");
  }

  const oauth2 = createOAuth2Client();
  const locationId = getLocationId();

  const response = await oauth2.request({
    url: `${BUSINESS_INFO_BASE}/locations/${locationId}/attributes`,
    method: "PATCH",
    params: { attributeMask: names.join(",") },
    data: {
      name: `locations/${locationId}/attributes`,
      attributes: [],
    },
  });

  return response.data?.attributes ?? [];
}

export async function publishToGoogleBusiness(post) {
  const oauth2 = createOAuth2Client();
  const parent = normalizeLocationName(config.googleBusiness.locationName);
  const summary = post.caption.trim().slice(0, SUMMARY_MAX);

  if (!summary) {
    throw new Error("Google Business posts need a caption.");
  }

  const body = {
    languageCode: config.googleBusiness.languageCode,
    summary,
    topicType: "STANDARD",
  };

  if (post.videoPath && !post.imagePath) {
    throw new Error(
      "Google Business local posts support images only. Use media.image or omit google_business."
    );
  }

  if (post.imagePath) {
    const relativePath = post.imageRelative;
    if (!relativePath) {
      throw new Error("Google Business image posts need media.image in the post YAML.");
    }
    body.media = [
      {
        mediaFormat: "PHOTO",
        sourceUrl: resolvePublicMediaUrl(relativePath),
      },
    ];
  }

  const response = await oauth2.request({
    url: `${MYBUSINESS_BASE}/${parent}/localPosts`,
    method: "POST",
    data: body,
  });

  const data = response.data ?? {};
  const postName = data.name ?? "";
  const postId = postName.split("/").pop() ?? postName;

  return {
    platform: "google_business",
    id: postId,
    url: data.searchUrl ?? undefined,
    type: "local_post",
  };
}

export async function verifyGoogleBusinessCredentials() {
  const oauth2 = createOAuth2Client();
  const parent = normalizeLocationName(config.googleBusiness.locationName);
  const locationId = parent.split("/locations/").pop();

  const response = await oauth2.request({
    url: `https://mybusinessbusinessinformation.googleapis.com/v1/locations/${locationId}`,
    params: { readMask: "name,title" },
  });

  // Posting uses mybusiness.googleapis.com/v4 — a separate API from location lookup.
  try {
    await oauth2.request({
      url: `${MYBUSINESS_BASE}/${parent}/localPosts`,
      params: { pageSize: 1 },
    });
  } catch (error) {
    const message = error.message ?? String(error);
    if (message.includes("has not been used") || message.includes("is disabled")) {
      throw new Error(
        "Google My Business API is not enabled for posting. Enable it in Google Cloud Console: " +
          "https://console.cloud.google.com/apis/library/mybusiness.googleapis.com " +
          "(also enable My Business Account Management API and My Business Business Information API). " +
          "Wait a few minutes after enabling, then retry."
      );
    }
    throw error;
  }

  return response.data?.title ?? parent;
}
