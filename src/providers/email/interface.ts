export interface SendEmailInput {
    to: string | string[];
    subject: string;
    html: string;
    text?: string;
    attachments?: Array<{ filename: string; content: Buffer; contentType: string }>;
}
export interface SendEmailResult { messageId: string; }
export interface IEmailProvider {
    sendEmail(input: SendEmailInput): Promise<SendEmailResult>;
}