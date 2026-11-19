export function fileType(bytes: Uint8Array): { extension: string; mime: string } | null;
export function documentType(bytes: Uint8Array, filename: string): Promise<{ extension: string; mime: string } | null>;
