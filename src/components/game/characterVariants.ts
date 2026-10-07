export type CharacterHair = "cap" | "ponytail" | "sideBob" | "beanie" | "buns" | "spiky";
export type CharacterOutfit = "varsity" | "sport" | "hoodie" | "overalls" | "tracksuit" | "jumper";
export type CharacterAccessory =
  "sling" | "ribbon" | "scarf" | "backpack" | "wristbands" | "starPin";

export type CharacterVariant = Readonly<{
  id: "player" | "pink" | "purple" | "orange" | "green" | "yellow";
  role: "player" | "runner";
  colors: Readonly<{
    shirt: string;
    pants: string;
    shoes: string;
    skin: string;
    skinLight: string;
    hair: string;
    accent: string;
    secondary: string;
  }>;
  hair: CharacterHair;
  outfit: CharacterOutfit;
  accessory: CharacterAccessory;
  scale: number;
}>;

function variant(value: CharacterVariant): CharacterVariant {
  Object.freeze(value.colors);
  return Object.freeze(value);
}

/** Stable visual identities shared by the player and the five existing runners. */
export const CHARACTER_VARIANTS: readonly CharacterVariant[] = Object.freeze([
  variant({
    id: "player",
    role: "player",
    colors: {
      shirt: "#258fe8",
      pants: "#244d88",
      shoes: "#1967a7",
      skin: "#f2c6a2",
      skinLight: "#ffdfc2",
      hair: "#30251f",
      accent: "#57e5ed",
      secondary: "#ffe19a",
    },
    hair: "cap",
    outfit: "varsity",
    accessory: "sling",
    scale: 1.03,
  }),
  variant({
    id: "pink",
    role: "runner",
    colors: {
      shirt: "#e95378",
      pants: "#a82f55",
      shoes: "#b94660",
      skin: "#f4d0b5",
      skinLight: "#ffe3cc",
      hair: "#5e293d",
      accent: "#ffd28a",
      secondary: "#fff3e5",
    },
    hair: "ponytail",
    outfit: "sport",
    accessory: "ribbon",
    scale: 0.99,
  }),
  variant({
    id: "purple",
    role: "runner",
    colors: {
      shirt: "#8259d5",
      pants: "#483c79",
      shoes: "#7056a9",
      skin: "#d69b72",
      skinLight: "#f1bb91",
      hair: "#29223d",
      accent: "#bca2f4",
      secondary: "#f9dd8e",
    },
    hair: "sideBob",
    outfit: "hoodie",
    accessory: "starPin",
    scale: 1,
  }),
  variant({
    id: "orange",
    role: "runner",
    colors: {
      shirt: "#ed8b30",
      pants: "#477c85",
      shoes: "#c56c2c",
      skin: "#c9865c",
      skinLight: "#e6aa7d",
      hair: "#68402d",
      accent: "#f8d779",
      secondary: "#fff0cf",
    },
    hair: "beanie",
    outfit: "overalls",
    accessory: "scarf",
    scale: 1.01,
  }),
  variant({
    id: "green",
    role: "runner",
    colors: {
      shirt: "#39ad70",
      pants: "#285b4d",
      shoes: "#338f65",
      skin: "#ecc5a0",
      skinLight: "#ffdfbd",
      hair: "#304d3b",
      accent: "#a8e581",
      secondary: "#e8f5dd",
    },
    hair: "buns",
    outfit: "tracksuit",
    accessory: "backpack",
    scale: 0.98,
  }),
  variant({
    id: "yellow",
    role: "runner",
    colors: {
      shirt: "#e7bd45",
      pants: "#425c8a",
      shoes: "#d9a83b",
      skin: "#efb98f",
      skinLight: "#ffdbb6",
      hair: "#664325",
      accent: "#f07e55",
      secondary: "#f4eab7",
    },
    hair: "spiky",
    outfit: "jumper",
    accessory: "wristbands",
    scale: 1.02,
  }),
]);

export function getCharacterVariant(index: number) {
  const result = CHARACTER_VARIANTS[index];
  if (!result) throw new RangeError(`No Catchy character variant at index ${index}`);
  return result;
}
