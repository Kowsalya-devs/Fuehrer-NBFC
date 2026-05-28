export interface SendSmsInput {
    to: string;   // +91XXXXXXXXXX
    message: string;
    templateId?: string;
}
export interface SendSmsResult {
    messageId: string;
    status: 'SENT' | 'FAILED';
}
export interface ISmsProvider {
    sendSms(input: SendSmsInput): Promise<SendSmsResult>;
    sendOtp(phone: string, otp: string): Promise<SendSmsResult>;
}
