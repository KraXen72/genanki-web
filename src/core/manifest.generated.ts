/* Generated from schemas/. Run pnpm types:generate; do not edit. */

export interface PackManifest {
  format_version: 1;
  key: string;
  input_version: number;
  name: string;
  model: {
    id: number;
    name: string;
  };
  schema: string;
  prompt: string;
  css: string;
  /**
   * @minItems 1
   * @maxItems 64
   */
  fields: {
    name: string;
    path: string;
    format: 'text' | 'lines' | 'list';
    item_path?: string;
  }[];
  /**
   * @minItems 1
   * @maxItems 8
   */
  cards: {
    name: string;
    front: string;
    back: string;
  }[];
  destination: {
    policy: 'fixed' | 'shared-source';
    deck: string;
  };
}
