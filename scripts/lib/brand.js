export const BRAND = {
  name: "Bishnupriya Fuels",
  location: "Padmalavpur, Manduka, Jajpur, Odisha 754205",
  services: "BPCL petrol, diesel, lubricants, fleet fueling",
  website: "https://bishnupriyafuels.fnsventures.in/",
  whatsapp: "+91 96689 13299",
};

export function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}
