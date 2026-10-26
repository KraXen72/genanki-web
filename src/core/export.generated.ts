/* Generated from schemas/. Run pnpm types:generate; do not edit. */

export interface ExportPayload {
  packKey: string;
  model: {
    id: number;
    name: string;
    fields: string[];
    cards: {
      name: string;
      qfmt: string;
      afmt: string;
    }[];
    css: string;
  };
  deck: {
    id: number;
    name: string;
  };
  notes: {
    id: string;
    fields: string[];
  }[];
}
