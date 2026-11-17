// Turns a posed character SVG into an image each frame, for the canvas renderer and the live preview.
import { CHARACTER_LIST, CHARACTER_POSERS, CHARACTER_SVGS } from "./characters.generated.ts";
import type { CharacterPose } from "./cartoon-motion.ts";

export type CharacterId = (typeof CHARACTER_LIST)[number]["id"];
export const CHARACTERS = CHARACTER_LIST;
export const DEFAULT_CHARACTER: CharacterId = "bilal";

export class CharacterRig {
  private svg: SVGSVGElement;
  private poser: (p: Partial<CharacterPose>) => void;
  private ser = new XMLSerializer();
  private busy = false;
  latest: HTMLImageElement | null = null;

  readonly id: CharacterId;

  constructor(id: CharacterId) {
    this.id = id;
    const doc = new DOMParser().parseFromString(CHARACTER_SVGS[id], "image/svg+xml");
    this.svg = doc.documentElement as unknown as SVGSVGElement;
    this.svg.setAttribute("width", "500");
    this.svg.setAttribute("height", "720");
    const $ = (sel: string) => this.svg.querySelector(`#${sel}`) as Element;
    this.poser = CHARACTER_POSERS[id]($);
  }

  /** Poses the character and resolves with a decoded image of it (500 x 720, transparent). */
  async frame(p: CharacterPose): Promise<HTMLImageElement> {
    this.poser(p);
    const img = new Image();
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(this.ser.serializeToString(this.svg));
    await img.decode();
    this.latest = img;
    return img;
  }

  /** For the live preview: refreshes in the background and returns the newest ready image. */
  frameNow(p: CharacterPose): HTMLImageElement | null {
    if (!this.busy) {
      this.busy = true;
      this.frame(p)
        .catch(() => undefined)
        .finally(() => (this.busy = false));
    }
    return this.latest;
  }
}
