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
    format: 'text' | 'lines' | 'list' | 'label';
    labels?: {
      [k: string]: string;
    };
    item_path?: string;
  }[];
  /**
   * @maxItems 64
   */
  tags?: {
    prefix: string;
    path: string;
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
  /**
   * Optional content checks reading raw values of the named fields. Dictionary facts can block export.
   *
   * @maxItems 8
   */
  validators?: {
    name: 'ru-stress';
    /**
     * @minItems 1
     * @maxItems 64
     */
    fields: string[];
  }[];
}
