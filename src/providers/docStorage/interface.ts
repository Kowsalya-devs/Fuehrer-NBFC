export interface UploadDocInput {
    key: string;    // S3 object key — e.g. "kyc/{userId}/aadhaar.jpg"
    fileBuffer: Buffer;
    contentType: string;
    metadata?: Record<string, string>;
}
export interface UploadDocResult { key: string; eTag: string; }
export interface SignedUrlResult { url: string; expiresAt: Date; }

export interface IDocStorageProvider {
    upload(input: UploadDocInput): Promise<UploadDocResult>;
    getSignedUrl(key: string): Promise<SignedUrlResult>;
    delete(key: string): Promise<void>;
    exists(key: string): Promise<boolean>;
}
