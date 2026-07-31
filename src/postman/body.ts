export type PostmanUrlEncodedParam = {
  key?: string;
  value?: string | null;
  disabled?: boolean;
  description?: string;
  type?: string;
};

export type PostmanFormdataParam = {
  key?: string;
  value?: string | null;
  disabled?: boolean;
  description?: string;
  type?: 'text' | 'file' | string;
  src?: string | string[] | null;
};

export type PostmanBodyMode = 'raw' | 'urlencoded' | 'formdata' | 'file' | 'graphql' | 'none';

export type PostmanBody = {
  mode?: PostmanBodyMode | string;
  raw?: string;
  urlencoded?: PostmanUrlEncodedParam[];
  formdata?: PostmanFormdataParam[];
  file?: { src?: string | null };
  graphql?: { query?: string; variables?: string };
  options?: {
    raw?: { language?: string; [key: string]: unknown };
    [key: string]: unknown;
  };
  [key: string]: unknown;
};
