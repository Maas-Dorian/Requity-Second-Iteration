import * as fs from 'fs';
import * as path from 'path';

interface BrevoContact {
  email: string;
  attributes?: {
    FNAME?: string;
    LNAME?: string;
    SOURCE?: string;
  };
  listIds?: number[];
}

// NOTE: This legacy module originally imported `storage` from `./storage`, which
// no longer exists. The minimal shapes and behavior this file relies on are
// defined locally to keep it self-contained and type-safe.
interface Assessment {
  clientName?: string | null;
}

interface ArchetypeTemplate {
  displayName: string;
  summary?: string | null;
  keyTraits?: string[];
  buyerApproaches?: string[];
  buyerAvoid?: string | null;
  sellerApproaches?: string[];
  sellerAvoid?: string | null;
  communicationRecommended?: string[];
  communicationAvoid?: string[];
  stressManagement?: string[];
  decisionMaking?: string[];
  psychologyBased?: string[];
  summaryTitle?: string | null;
  buyerApproachesTitle?: string | null;
  buyerAvoidTitle?: string | null;
  sellerApproachesTitle?: string | null;
  sellerAvoidTitle?: string | null;
  communicationRecommendedTitle?: string | null;
  communicationAvoidTitle?: string | null;
  stressManagementTitle?: string | null;
  decisionMakingTitle?: string | null;
  psychologyBasedTitle?: string | null;
}

// Minimal local replacement for the former `./storage` module. Returns no data
// so callers fall back to the built-in default report content below.
const storage = {
  async getAssessmentById(_assessmentId: number): Promise<Assessment | null> {
    return null;
  },
  async getPublishedArchetypeTemplates(): Promise<ArchetypeTemplate[]> {
    return [];
  },
};

class BrevoService {
  private apiKey: string;
  private listId: number;
  private senderEmail: string;
  private baseUrl = 'https://api.brevo.com/v3';

  constructor() {
    this.apiKey = process.env.BREVO_API_KEY || '';
    this.listId = parseInt(process.env.BREVO_LIST_ID || '0');
    this.senderEmail = process.env.BREVO_SENDER_EMAIL || 'hello@requityapp.com';
    
    if (!this.apiKey) {
      console.log('[BREVO] No API key found, running in test mode');
    } else {
      console.log('[BREVO] Service initialized with API key');
      console.log('[BREVO] Sender email:', process.env.BREVO_SENDER_EMAIL || 'hello@requityapp.com');
      console.log('[BREVO] List ID:', this.listId);
    }
  }

  async addContactToList(email: string, source: string = 'Ebook Download', firstName?: string, lastName?: string): Promise<boolean> {
    if (!this.apiKey) {
      console.log(`[BREVO] Would add contact ${firstName} ${lastName} (${email}) to list`);
      return true;
    }

    try {
      console.log(`[BREVO] Adding contact ${email} to list ${this.listId}`);
      
      const payload = {
        email,
        attributes: {
          FNAME: firstName || '',
          LNAME: lastName || '',
          SOURCE: source
        },
        listIds: this.listId ? [this.listId] : undefined,
        updateEnabled: true
      };
      
      console.log(`[BREVO] Payload:`, JSON.stringify(payload, null, 2));

      const response = await fetch(`${this.baseUrl}/contacts`, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'api-key': this.apiKey
        },
        body: JSON.stringify(payload)
      });

      const responseText = await response.text();
      console.log(`[BREVO] Response status: ${response.status}`);
      console.log(`[BREVO] Response body:`, responseText);

      if (response.ok) {
        console.log(`[BREVO] Successfully added contact: ${email}`);
        return true;
      } else {
        console.error(`[BREVO] Failed to add contact - Status: ${response.status}`);
        console.error(`[BREVO] Error response:`, responseText);
        return false;
      }
    } catch (error) {
      console.error(`[BREVO] Error adding contact:`, error);
      return false;
    }
  }

  async sendWelcomeEmail(email: string, firstName?: string): Promise<boolean> {
    if (!this.apiKey) {
      console.log(`[BREVO] Would send welcome email to: ${email}`);
      return true;
    }

    try {
      // Read the ebook PDF file
      const pdfPath = path.join(process.cwd(), 'client/public/requity-lead-magnet.pdf');
      
      let ebookAttachment: { content: string; name: string; type: string } | null = null;
      try {
        const pdfBuffer = fs.readFileSync(pdfPath);
        ebookAttachment = {
          content: pdfBuffer.toString('base64'),
          name: "Why-Most-Agents-Lose-70-Percent-of-Their-Leads-Mike-Gandolfo.pdf",
          type: "application/pdf"
        };
        console.log(`[BREVO] Ebook PDF loaded, size: ${pdfBuffer.length} bytes`);
      } catch (fileError) {
        console.error(`[BREVO] Failed to read ebook PDF:`, fileError);
        // Continue without attachment if file not found
      }

      const emailData: any = {
        sender: {
          name: "REQUITY Team",
          email: process.env.BREVO_SENDER_EMAIL || "hello@requityapp.com"
        },
        to: [{ email }],
        subject: "Your REQUITY Ebook + Exclusive Resources Inside",
        htmlContent: `
          <div style="max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <!-- REQUITY Logo Header -->
            <div style="background: white; padding: 30px; text-align: center; border-bottom: 3px solid #ff6a00;">
              <div style="font-size: 48px; font-weight: bold; color: #1e3a8a; margin-bottom: 5px;">
                RE<span style="color: #ff6a00;">Q</span>UITY
              </div>
              <div style="font-size: 14px; color: #666; letter-spacing: 2px;">BUILDING BETTER PROFESSIONAL RELATIONSHIPS</div>
            </div>
            
            <div style="background: linear-gradient(135deg, #ff6a00 0%, #ff8533 100%); padding: 30px; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 28px;">Welcome to REQUITY!</h1>
              <p style="color: white; margin: 10px 0 0 0; opacity: 0.9;">Your ebook is attached below</p>
            </div>
            
            <div style="padding: 40px 30px; background: white;">
              <h2 style="color: #333; margin-bottom: 20px;">Hi ${firstName ? firstName : 'there'}! Thank you for downloading our ebook!</h2>
              
              <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h3 style="color: #ff6a00; margin-top: 0;">📚 Your Ebook is Attached</h3>
                <p style="margin-bottom: 10px; font-weight: bold;">"Why Most Agents Lose 70% of Their Leads, And How to Fix It Immediately" by Mike Gandolfo</p>
                <p style="margin-bottom: 0; color: #666; font-size: 14px;">📎 Check your email attachments to download the PDF</p>
              </div>
              
              <h3 style="color: #333; margin-top: 30px;">What's Next?</h3>
              <ul style="margin-bottom: 30px; padding-left: 20px;">
                <li style="margin-bottom: 10px;">📚 Review the proven scripts in your ebook attachment</li>
                <li style="margin-bottom: 10px;">🔧 Try REQUITY's relational assessment tool</li>
                <li style="margin-bottom: 10px;">📈 Watch for more tips in your inbox</li>
              </ul>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="https://requityapp.com" style="background: linear-gradient(135deg, #ff6a00 0%, #ff8533 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Start Using REQUITY Free</a>
              </div>
              
              <div style="border-top: 1px solid #eee; padding-top: 20px; margin-top: 30px;">
                <p style="margin-bottom: 0;">Best regards,<br><strong>The REQUITY Team</strong></p>
              </div>
            </div>
            
            <div style="background: #f8f9fa; padding: 20px 30px; text-align: center; border-top: 1px solid #eee;">
              <p style="margin: 0; font-size: 12px; color: #666;">You're receiving this because you downloaded our ebook. We'll send you occasional tips about improving your lead conversion.</p>
            </div>
          </div>
        `
      };

      // Add attachment if ebook PDF was loaded successfully
      if (ebookAttachment) {
        emailData.attachment = [ebookAttachment];
        console.log(`[BREVO] Email will include ebook PDF attachment`);
      }

      const response = await fetch(`${this.baseUrl}/smtp/email`, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'api-key': this.apiKey
        },
        body: JSON.stringify(emailData)
      });

      const responseText = await response.text();
      console.log(`[BREVO] Email response status: ${response.status}`);
      console.log(`[BREVO] Email response body:`, responseText);

      if (response.ok) {
        console.log(`[BREVO] Welcome email sent successfully to: ${email}`);
        return true;
      } else {
        console.error(`[BREVO] Failed to send welcome email - Status: ${response.status}`);
        return false;
      }
    } catch (error) {
      console.error(`[BREVO] Error sending welcome email:`, error);
      return false;
    }
  }

  async sendPasswordResetEmail(email: string, resetToken: string, userName?: string): Promise<boolean> {
    if (!this.apiKey) {
      console.log(`[BREVO] Would send password reset email to: ${email}`);
      return true;
    }

    try {
      const resetUrl = `${process.env.NODE_ENV === 'development' ? 'http://localhost:5000' : 'https://your-domain.com'}/reset-password?token=${resetToken}`;
      
      const response = await fetch(`${this.baseUrl}/smtp/email`, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'api-key': this.apiKey
        },
        body: JSON.stringify({
          sender: {
            name: "REQUITY Team",
            email: process.env.BREVO_SENDER_EMAIL || "hello@requityapp.com"
          },
          to: [{ email, name: userName || '' }],
          subject: "Reset Your REQUITY Password",
          htmlContent: `
            <div style="max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
              <!-- REQUITY Logo Header -->
              <div style="background: white; padding: 30px; text-align: center; border-bottom: 3px solid #ff6a00;">
                <div style="font-size: 48px; font-weight: bold; color: #1e3a8a; margin-bottom: 5px;">
                  RE<span style="color: #ff6a00;">Q</span>UITY
                </div>
                <div style="font-size: 14px; color: #666; letter-spacing: 2px;">BUILDING BETTER PROFESSIONAL RELATIONSHIPS</div>
              </div>
              
              <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
                <h1 style="color: white; margin: 0; font-size: 28px;">Password Reset Request</h1>
                <p style="color: white; margin: 10px 0 0 0; opacity: 0.9;">Secure password reset for your account</p>
              </div>
              
              <div style="padding: 40px 30px; background: white;">
                <h2 style="color: #333; margin-bottom: 20px;">Hello ${userName || 'there'},</h2>
                
                <p style="margin-bottom: 20px;">You requested to reset your password for your REQUITY account.</p>
                
                <p style="margin-bottom: 30px;">Click the button below to reset your password:</p>
                
                <div style="text-align: center; margin: 30px 0;">
                  <a href="${resetUrl}" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Reset Password</a>
                </div>
                
                <p style="margin-bottom: 10px; font-size: 14px; color: #666;">Or copy and paste this link in your browser:</p>
                <p style="margin-bottom: 30px; font-size: 14px; color: #666; word-break: break-all;">${resetUrl}</p>
                
                <div style="border-top: 1px solid #eee; padding-top: 20px; margin-top: 30px;">
                  <p style="font-size: 14px; color: #999; margin-bottom: 10px;">⏰ This link will expire in 1 hour for security reasons.</p>
                  <p style="font-size: 14px; color: #999; margin-bottom: 0;">If you didn't request this password reset, please ignore this email.</p>
                </div>
              </div>
              
              <div style="background: #f8f9fa; padding: 20px 30px; text-align: center; border-top: 1px solid #eee;">
                <p style="margin: 0; font-size: 14px; color: #666;">Best regards,<br>The REQUITY Team</p>
              </div>
            </div>
          `
        })
      });

      const responseText = await response.text();
      console.log(`[BREVO] Password reset email response status: ${response.status}`);
      console.log(`[BREVO] Password reset email response:`, responseText);

      if (response.ok) {
        console.log(`[BREVO] Password reset email sent successfully to: ${email}`);
        return true;
      } else {
        console.error(`[BREVO] Failed to send password reset email - Status: ${response.status}`);
        return false;
      }
    } catch (error) {
      console.error(`[BREVO] Error sending password reset email:`, error);
      return false;
    }
  }

  async sendPasswordResetCode(email: string, verificationCode: string, userName?: string): Promise<boolean> {
    if (!this.apiKey) {
      console.log(`[BREVO] Would send password reset code to: ${email}`);
      console.log(`[BREVO] Verification code: ${verificationCode}`);
      return true;
    }

    try {
      const senderEmail = process.env.BREVO_SENDER_EMAIL || "hello@requityapp.com";

      const emailPayload = {
        sender: {
          name: "REQUITY Team",
          email: senderEmail
        },
        to: [{ email, name: userName || '' }],
        subject: "Your REQUITY Password Reset Code",
        htmlContent: `
            <div style="max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
              <!-- REQUITY Logo Header -->
              <div style="background: white; padding: 30px; text-align: center; border-bottom: 3px solid #ff6a00;">
                <div style="font-size: 48px; font-weight: bold; color: #1e3a8a; margin-bottom: 5px;">
                  RE<span style="color: #ff6a00;">Q</span>UITY
                </div>
                <div style="font-size: 14px; color: #666; letter-spacing: 2px;">BUILDING BETTER PROFESSIONAL RELATIONSHIPS</div>
              </div>
              
              <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
                <h1 style="color: white; margin: 0; font-size: 28px;">Password Reset Code</h1>
                <p style="color: white; margin: 10px 0 0 0; opacity: 0.9;">Your verification code is below</p>
              </div>
              
              <div style="padding: 40px 30px; background: white;">
                <h2 style="color: #333; margin-bottom: 20px;">Hello ${userName || 'there'},</h2>
                
                <p style="margin-bottom: 20px;">You requested to reset your password for your REQUITY account.</p>
                
                <p style="margin-bottom: 30px;">Enter this 5-character verification code on the website:</p>
                
                <div style="text-align: center; margin: 40px 0;">
                  <div style="background: #f8f9fa; padding: 30px; border-radius: 12px; display: inline-block; border: 2px solid #667eea;">
                    <div style="font-size: 36px; font-weight: bold; color: #667eea; letter-spacing: 8px; font-family: monospace;">
                      ${verificationCode}
                    </div>
                  </div>
                </div>
                
                <div style="border-top: 1px solid #eee; padding-top: 20px; margin-top: 30px;">
                  <p style="font-size: 14px; color: #999; margin-bottom: 10px;">⏰ This code will expire in 1 hour for security reasons.</p>
                  <p style="font-size: 14px; color: #999; margin-bottom: 0;">If you didn't request this password reset, please ignore this email.</p>
                </div>
              </div>
              
              <div style="background: #f8f9fa; padding: 20px 30px; text-align: center; border-top: 1px solid #eee;">
                <p style="margin: 0; font-size: 14px; color: #666;">Best regards,<br>The REQUITY Team</p>
              </div>
            </div>
          `
      };



      const response = await fetch(`${this.baseUrl}/smtp/email`, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'api-key': this.apiKey
        },
        body: JSON.stringify(emailPayload)
      });

      const responseText = await response.text();

      if (response.ok) {
        return true;
      } else {
        console.error(`[BREVO] Failed to send password reset code email - Status: ${response.status}, Response: ${responseText}`);
        return false;
      }
    } catch (error) {
      console.error(`[BREVO] Error sending password reset code email:`, error);
      return false;
    }
  }

  async sendClientFeedbackReport(
    agentEmail: string,
    agentName: string,
    clientName: string,
    clientEmail: string,
    assessmentId: number,
    rating: number,
    positiveAspects?: string,
    improvements?: string,
    communicationFeedback?: string,
    testimonial?: string
  ): Promise<boolean> {
    if (!this.apiKey) {
      console.log(`[BREVO] Would send client feedback report to: ${agentEmail} about ${clientName}`);
      return true;
    }

    try {
      // Get star rating display
      const stars = '★'.repeat(rating) + '☆'.repeat(5 - rating);
      
      const emailData = {
        sender: {
          name: "REQUITY Platform",
          email: process.env.BREVO_SENDER_EMAIL || "hello@requityapp.com"
        },
        to: [{ email: agentEmail, name: agentName }],
        subject: `Client Feedback Received: ${clientName} - ${stars}`,
        htmlContent: `
          <div style="max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <!-- REQUITY Logo Header -->
            <div style="background: white; padding: 30px; text-align: center; border-bottom: 3px solid #ff6a00;">
              <div style="font-size: 48px; font-weight: bold; color: #1e3a8a; margin-bottom: 5px;">
                RE<span style="color: #ff6a00;">Q</span>UITY
              </div>
              <div style="font-size: 14px; color: #666; letter-spacing: 2px;">BUILDING BETTER PROFESSIONAL RELATIONSHIPS</div>
            </div>
            
            <div style="background: linear-gradient(135deg, #ff6a00 0%, #ff8533 100%); padding: 30px; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 28px;">Client Feedback Received</h1>
              <p style="color: white; margin: 10px 0 0 0; opacity: 0.9;">Your client has completed their experience review</p>
            </div>
            
            <div style="padding: 40px 30px; background: white;">
              <h2 style="color: #333; margin-bottom: 20px;">Hello ${agentName},</h2>
              
              <p style="margin-bottom: 20px;">Great news! <strong>${clientName}</strong> has completed their feedback review for the assessment.</p>
              
              <div style="background: #f8f9fa; padding: 25px; border-radius: 12px; margin: 20px 0;">
                <h3 style="color: #ff6a00; margin-top: 0; font-size: 20px;">Overall Rating</h3>
                <div style="font-size: 36px; color: #ff6a00; margin: 10px 0;">${stars}</div>
                <p style="color: #666; margin: 0;">${rating} out of 5 stars</p>
              </div>
              
              ${positiveAspects ? `
              <div style="background: #e8f5e9; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #4caf50;">
                <h4 style="color: #2e7d32; margin-top: 0;">What went well:</h4>
                <p style="margin: 0; color: #1b5e20;">${positiveAspects}</p>
              </div>
              ` : ''}
              
              ${improvements ? `
              <div style="background: #fff3e0; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ff9800;">
                <h4 style="color: #e65100; margin-top: 0;">Areas for improvement:</h4>
                <p style="margin: 0; color: #bf360c;">${improvements}</p>
              </div>
              ` : ''}
              
              ${communicationFeedback ? `
              <div style="background: #e3f2fd; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #2196f3;">
                <h4 style="color: #0d47a1; margin-top: 0;">Communication effectiveness:</h4>
                <p style="margin: 0; color: #01579b;">${communicationFeedback}</p>
              </div>
              ` : ''}
              
              ${testimonial ? `
              <div style="background: #f3e5f5; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #9c27b0;">
                <h4 style="color: #4a148c; margin-top: 0;">Client testimonial:</h4>
                <p style="margin: 0; color: #6a1b9a; font-style: italic;">"${testimonial}"</p>
              </div>
              ` : ''}
              
              <div style="margin-top: 30px; padding: 20px; background: #f5f5f5; border-radius: 8px;">
                <p style="margin: 0; color: #666;">
                  <strong>Client:</strong> ${clientName}<br>
                  <strong>Email:</strong> ${clientEmail}<br>
                  <strong>Assessment ID:</strong> #${assessmentId}
                </p>
              </div>
              
              <p style="margin-top: 30px; color: #666; font-size: 14px;">
                This feedback was submitted as part of the closed assessment review process. Use these insights to continuously improve your client relationships and service delivery.
              </p>
            </div>
            
            <div style="background: #f5f5f5; padding: 20px; text-align: center; color: #666; font-size: 12px;">
              <p style="margin: 0;">© ${new Date().getFullYear()} REQUITY. All rights reserved.</p>
            </div>
          </div>
        `
      };

      const response = await fetch(`${this.baseUrl}/smtp/email`, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'api-key': this.apiKey
        },
        body: JSON.stringify(emailData)
      });

      const responseText = await response.text();
      console.log(`[BREVO] Client feedback email response status: ${response.status}`);
      console.log(`[BREVO] Client feedback email response:`, responseText);

      if (response.ok) {
        console.log(`[BREVO] Client feedback report sent successfully to: ${agentEmail}`);
        return true;
      } else {
        console.error(`[BREVO] Failed to send client feedback report - Status: ${response.status}`);
        console.error(`[BREVO] Error response:`, responseText);
        return false;
      }
    } catch (error) {
      console.error(`[BREVO] Error sending client feedback report:`, error);
      return false;
    }
  }

  async sendAgentNotification(
    agentEmail: string,
    agentName: string,
    clientName: string,
    clientEmail: string,
    reportUrl: string,
    archetype: string,
    pdfBuffer?: Buffer
  ): Promise<boolean> {
    if (!this.apiKey) {
      console.log(`[BREVO] Would send agent notification to: ${agentEmail} about ${clientName}`);
      return true;
    }

    try {
      const attachments: Array<{ content: string; name: string }> = [];
      if (pdfBuffer) {
        attachments.push({
          content: pdfBuffer.toString('base64'),
          name: `${clientName.replace(/[^a-zA-Z0-9]/g, '_')}_Assessment_Report.pdf`
        });
      }

      const emailData = {
        sender: {
          name: "REQUITY Platform",
          email: process.env.BREVO_SENDER_EMAIL || "hello@requityapp.com"
        },
        to: [{ email: agentEmail, name: agentName }],
        subject: `New Assessment Completed: ${clientName} - ${archetype}`,
        htmlContent: `
          <div style="max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <!-- REQUITY Logo Header -->
            <div style="background: white; padding: 30px; text-align: center; border-bottom: 3px solid #ff6a00;">
              <div style="font-size: 48px; font-weight: bold; color: #1e3a8a; margin-bottom: 5px;">
                RE<span style="color: #ff6a00;">Q</span>UITY
              </div>
              <div style="font-size: 14px; color: #666; letter-spacing: 2px;">BUILDING BETTER PROFESSIONAL RELATIONSHIPS</div>
            </div>
            
            <div style="background: linear-gradient(135deg, #ff6a00 0%, #ff8533 100%); padding: 30px; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 28px;">Client Assessment Completed</h1>
              <p style="color: white; margin: 10px 0 0 0; opacity: 0.9;">New assessment results ready for review</p>
            </div>
            
            <div style="padding: 40px 30px; background: white;">
              <h2 style="color: #333; margin-bottom: 20px;">Hello ${agentName},</h2>
              
              <p style="margin-bottom: 20px;">Great news! <strong>${clientName}</strong> has completed their relational assessment.</p>
              
              <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h3 style="color: #ff6a00; margin-top: 0;">Assessment Results</h3>
                <p style="margin-bottom: 10px;"><strong>Client:</strong> ${clientName}</p>
                <p style="margin-bottom: 10px;"><strong>Email:</strong> ${clientEmail}</p>
                <p style="margin-bottom: 0;"><strong>Archetype:</strong> ${archetype}</p>
              </div>
              
              <p style="margin-bottom: 30px;">The complete assessment report has been automatically sent to your client and is attached to this email. You can also view the full report online using the link below.</p>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${reportUrl}" style="background: linear-gradient(135deg, #ff6a00 0%, #ff8533 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">View Full Report</a>
              </div>
              
              <div style="background: #e8f5e8; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h4 style="color: #28a745; margin-top: 0;">Next Steps</h4>
                <ul style="margin-bottom: 0; padding-left: 20px;">
                  <li>Review the detailed personality insights</li>
                  <li>Use the communication recommendations</li>
                  <li>Follow up with ${clientName} using their preferred style</li>
                </ul>
              </div>
            </div>
            
            <div style="background: #f8f9fa; padding: 20px 30px; text-align: center; border-top: 1px solid #eee;">
              <p style="margin: 0; font-size: 14px; color: #666;">Keep building stronger relationships,<br>The REQUITY Team</p>
            </div>
          </div>
        `,
        ...(attachments.length > 0 && { attachment: attachments })
      };

      console.log(`[BREVO] Sending agent notification from ${emailData.sender.email} to ${agentEmail}...`);
      
      const response = await fetch(`${this.baseUrl}/smtp/email`, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'api-key': this.apiKey
        },
        body: JSON.stringify(emailData)
      });

      const responseText = await response.text();
      console.log(`[BREVO] Agent notification response status: ${response.status}`);
      console.log(`[BREVO] Agent notification response:`, responseText);

      if (response.ok) {
        console.log(`[BREVO] Agent notification sent successfully to: ${agentEmail}`);
        return true;
      } else {
        console.error(`[BREVO] Failed to send agent notification - Status: ${response.status}`);
        console.error(`[BREVO] Error response:`, responseText);
        return false;
      }
    } catch (error) {
      console.error(`[BREVO] Error sending agent notification:`, error);
      return false;
    }
  }

  async sendClientAssessmentReport(
    clientEmail: string, 
    clientName: string, 
    agentName: string,
    agentEmail: string,
    reportUrl: string,
    archetype: string,
    reportHtml: string,
    assessmentId?: number
  ): Promise<boolean> {
    if (!this.apiKey) {
      console.log(`[BREVO] Would send client assessment report to: ${clientEmail}`);
      console.log(`[BREVO] Report URL: ${reportUrl}`);
      console.log(`[BREVO] Archetype: ${archetype}`);
      return true;
    }

    try {
      // Check if we're sending to agent or client
      const isAgentRecipient = clientEmail === agentEmail;
      console.log(`[BREVO] Sending assessment report with inline HTML to: ${clientEmail}`);
      console.log(`[BREVO] Report HTML length: ${reportHtml.length} characters`);
      console.log(`[BREVO] Recipient is agent: ${isAgentRecipient}`);

      const response = await fetch(`${this.baseUrl}/smtp/email`, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'api-key': this.apiKey
        },
        body: JSON.stringify({
          sender: {
            name: "REQUITY Platform",
            email: process.env.BREVO_SENDER_EMAIL || "info@requityapp.com"
          },
          to: [{ email: clientEmail, name: isAgentRecipient ? agentName : clientName }],
          subject: isAgentRecipient 
            ? `Client Assessment Completed: ${clientName} - ${archetype}`
            : `Your REQUITY Assessment Report - ${clientName}`,
          htmlContent: reportHtml || `
            <div style="max-width: 800px; margin: 0 auto; font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
              <!-- REQUITY Logo Header -->
              <div style="background: white; padding: 30px; text-align: center; border-bottom: 3px solid #ff6a00;">
                <div style="font-size: 48px; font-weight: bold; color: #1e3a8a; margin-bottom: 5px;">
                  RE<span style="color: #ff6a00;">Q</span>UITY
                </div>
                <div style="font-size: 14px; color: #666; letter-spacing: 2px;">BUILDING BETTER PROFESSIONAL RELATIONSHIPS</div>
              </div>
              
              <div style="background: linear-gradient(135deg, #ff6a00 0%, #ff8533 100%); padding: 30px; text-align: center;">
                <h1 style="color: white; margin: 0; font-size: 28px;">Your Assessment Report</h1>
                <p style="color: white; margin: 10px 0 0 0; opacity: 0.9;">Personalized insights from ${agentName}</p>
              </div>
              
              <div style="padding: 30px; background: white;">
                <h2 style="color: #333; margin-bottom: 20px;">Hi ${clientName},</h2>
                
                <p style="margin-bottom: 20px;">Thank you for completing your REQUITY assessment!</p>
                
                <p style="margin-bottom: 30px;">Your detailed personality report is attached to this email as a PDF. You can also view it online at:</p>
                
                <div style="text-align: center; margin: 30px 0;">
                  <a href="${reportUrl}" style="background: linear-gradient(135deg, #ff6a00 0%, #ff8533 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">View Your Report Online</a>
                </div>
                
                <div style="border-top: 1px solid #eee; padding-top: 20px; margin-top: 30px;">
                  <p style="margin-bottom: 10px;">Best regards,</p>
                  <p style="margin: 0;"><strong>${agentName}</strong></p>
                  <p style="margin: 5px 0; color: #666;">${agentEmail}</p>
                </div>
              </div>
            </div>
          `
        })
      });

      const responseText = await response.text();
      console.log(`[BREVO] Client assessment email response status: ${response.status}`);
      console.log(`[BREVO] Client assessment email response:`, responseText);

      if (response.ok) {
        console.log(`[BREVO] Client assessment report sent successfully to: ${clientEmail}`);
        return true;
      } else {
        console.error(`[BREVO] Failed to send client assessment report - Status: ${response.status}`);
        console.error(`[BREVO] Error response:`, responseText);
        return false;
      }
    } catch (error) {
      console.error(`[BREVO] Error sending client assessment report:`, error);
      return false;
    }
  }

  async generateCompleteReportHtml(assessmentId: number, archetype: string): Promise<string> {
    console.log(`[BREVO] Starting generateCompleteReportHtml for assessment ${assessmentId}, archetype: ${archetype}`);

    // Get assessment details
    const assessment = await storage.getAssessmentById(assessmentId);
    if (!assessment) {
      console.error(`[BREVO] Assessment not found for ID: ${assessmentId}`);
      throw new Error('Assessment not found');
    }
    console.log(`[BREVO] Assessment found: ${assessment.clientName}`);

    // Get archetype template data
    const templates = await storage.getPublishedArchetypeTemplates();
    console.log(`[BREVO] Found ${templates.length} published templates`);
    const template = templates.find(t => t.displayName === archetype);
    
    if (!template) {
      console.error(`[BREVO] Archetype template not found for: ${archetype}`);
      console.error(`[BREVO] Available templates: ${templates.map(t => t.displayName).join(', ')}`);
      throw new Error('Archetype template not found');
    }
    console.log(`[BREVO] Template found: ${template.displayName}`)

    // Generate complete report HTML with safe defaults for title fields
    const titles = {
      summaryTitle: template.summaryTitle || 'Personality Overview',
      buyerApproachesTitle: template.buyerApproachesTitle || 'If You\'re Looking to Buy',
      buyerAvoidTitle: template.buyerAvoidTitle || 'What to Avoid as a Buyer',
      sellerApproachesTitle: template.sellerApproachesTitle || 'If You\'re Looking to Sell',
      sellerAvoidTitle: template.sellerAvoidTitle || 'What to Avoid as a Seller',
      communicationRecommendedTitle: template.communicationRecommendedTitle || 'Communication Style',
      communicationAvoidTitle: template.communicationAvoidTitle || 'Communication to Avoid',
      stressManagementTitle: template.stressManagementTitle || 'Stress Management',
      decisionMakingTitle: template.decisionMakingTitle || 'Decision Making Support',
      psychologyBasedTitle: template.psychologyBasedTitle || 'Psychology-Based Approaches'
    };

    // Ensure arrays exist with defaults
    const data = {
      summary: template.summary || `${archetype} - A unique personality type with specific preferences and communication styles.`,
      keyTraits: template.keyTraits || [],
      buyerApproaches: template.buyerApproaches || [],
      buyerAvoid: template.buyerAvoid || 'Generic, one-size-fits-all approaches',
      sellerApproaches: template.sellerApproaches || [],
      sellerAvoid: template.sellerAvoid || 'Pushy or rushed tactics',
      communicationRecommended: template.communicationRecommended || [],
      communicationAvoid: template.communicationAvoid || [],
      stressManagement: template.stressManagement || [],
      decisionMaking: template.decisionMaking || [],
      psychologyBased: template.psychologyBased || []
    };

    console.log(`[BREVO] Generating HTML with data:`, {
      archetype,
      hasKeyTraits: data.keyTraits.length > 0,
      hasBuyerApproaches: data.buyerApproaches.length > 0,
      hasCommunication: data.communicationRecommended.length > 0
    });

    return `
      <div style="max-width: 800px; margin: 20px auto; font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #ff6a00 0%, #ff8533 100%); padding: 30px; text-align: center; border-radius: 12px 12px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 28px; font-weight: bold;">REQUITY</h1>
          <p style="color: white; margin: 10px 0 0 0; opacity: 0.9; font-size: 16px;">Your Complete Assessment Report</p>
        </div>

        <!-- Client Information -->
        <div style="background: white; padding: 30px; border-left: 4px solid #ff6a00;">
          <h2 style="color: #333; margin: 0 0 20px 0; font-size: 24px;">Hello ${assessment.clientName},</h2>
          <p style="margin-bottom: 20px; font-size: 16px;">Congratulations on completing your REQUITY assessment! Here's your comprehensive personality report.</p>
          
          <div style="background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%); padding: 20px; border-radius: 10px; margin: 20px 0; border-left: 4px solid #ff6a00;">
            <h3 style="color: #ff6a00; margin-top: 0; font-size: 20px;">Your Archetype: ${archetype}</h3>
            <p style="margin-bottom: 0; font-size: 16px; color: #555;">${data.summary}</p>
          </div>
        </div>

        ${data.keyTraits.length > 0 ? `
        <!-- Personality Overview -->
        <div style="background: white; padding: 30px; border-left: 4px solid #007bff;">
          <h3 style="color: #007bff; margin-top: 0; font-size: 20px; display: flex; align-items: center;">
            <span style="background: linear-gradient(135deg, #007bff 0%, #0056b3 100%); color: white; padding: 8px 12px; border-radius: 8px; margin-right: 12px; font-size: 16px;">📊</span>
            ${titles.summaryTitle}
          </h3>
          <div style="background: #f8f9ff; padding: 20px; border-radius: 10px; border-left: 4px solid #007bff;">
            ${data.keyTraits.map(trait => `<p style="margin: 8px 0; font-size: 15px;">• ${trait}</p>`).join('')}
          </div>
        </div>` : ''}

        ${data.buyerApproaches.length > 0 ? `
        <!-- Buyer Approaches -->
        <div style="background: white; padding: 30px; border-left: 4px solid #28a745;">
          <h3 style="color: #28a745; margin-top: 0; font-size: 20px; display: flex; align-items: center;">
            <span style="background: linear-gradient(135deg, #28a745 0%, #20c997 100%); color: white; padding: 8px 12px; border-radius: 8px; margin-right: 12px; font-size: 16px;">🏠</span>
            ${titles.buyerApproachesTitle}
          </h3>
          <div style="background: #f8fff8; padding: 20px; border-radius: 10px; border-left: 4px solid #28a745;">
            ${data.buyerApproaches.map(approach => `<p style="margin: 8px 0; font-size: 15px;">• ${approach}</p>`).join('')}
          </div>
          
          <h4 style="color: #dc3545; margin-top: 25px; font-size: 18px; display: flex; align-items: center;">
            <span style="background: linear-gradient(135deg, #dc3545 0%, #c82333 100%); color: white; padding: 6px 10px; border-radius: 6px; margin-right: 10px; font-size: 14px;">⚠️</span>
            ${titles.buyerAvoidTitle}
          </h4>
          <div style="background: #fff8f8; padding: 20px; border-radius: 10px; border-left: 4px solid #dc3545;">
            <p style="margin: 8px 0; font-size: 15px;">${data.buyerAvoid}</p>
          </div>
        </div>` : ''}

        ${data.sellerApproaches.length > 0 ? `
        <!-- Seller Approaches -->
        <div style="background: white; padding: 30px; border-left: 4px solid #6f42c1;">
          <h3 style="color: #6f42c1; margin-top: 0; font-size: 20px; display: flex; align-items: center;">
            <span style="background: linear-gradient(135deg, #6f42c1 0%, #5a32a3 100%); color: white; padding: 8px 12px; border-radius: 8px; margin-right: 12px; font-size: 16px;">🏡</span>
            ${titles.sellerApproachesTitle}
          </h3>
          <div style="background: #faf8ff; padding: 20px; border-radius: 10px; border-left: 4px solid #6f42c1;">
            ${data.sellerApproaches.map(approach => `<p style="margin: 8px 0; font-size: 15px;">• ${approach}</p>`).join('')}
          </div>
          
          <h4 style="color: #dc3545; margin-top: 25px; font-size: 18px; display: flex; align-items: center;">
            <span style="background: linear-gradient(135deg, #dc3545 0%, #c82333 100%); color: white; padding: 6px 10px; border-radius: 6px; margin-right: 10px; font-size: 14px;">⚠️</span>
            ${titles.sellerAvoidTitle}
          </h4>
          <div style="background: #fff8f8; padding: 20px; border-radius: 10px; border-left: 4px solid #dc3545;">
            <p style="margin: 8px 0; font-size: 15px;">${data.sellerAvoid}</p>
          </div>
        </div>` : ''}

        ${data.communicationRecommended.length > 0 ? `
        <!-- Communication Style -->
        <div style="background: white; padding: 30px; border-left: 4px solid #17a2b8;">
          <h3 style="color: #17a2b8; margin-top: 0; font-size: 20px; display: flex; align-items: center;">
            <span style="background: linear-gradient(135deg, #17a2b8 0%, #138496 100%); color: white; padding: 8px 12px; border-radius: 8px; margin-right: 12px; font-size: 16px;">💬</span>
            ${titles.communicationRecommendedTitle}
          </h3>
          <div style="background: #f8ffff; padding: 20px; border-radius: 10px; border-left: 4px solid #17a2b8;">
            ${data.communicationRecommended.map(style => `<p style="margin: 8px 0; font-size: 15px;">• ${style}</p>`).join('')}
          </div>
          
          ${data.communicationAvoid.length > 0 ? `
          <h4 style="color: #dc3545; margin-top: 25px; font-size: 18px; display: flex; align-items: center;">
            <span style="background: linear-gradient(135deg, #dc3545 0%, #c82333 100%); color: white; padding: 6px 10px; border-radius: 6px; margin-right: 10px; font-size: 14px;">⚠️</span>
            ${titles.communicationAvoidTitle}
          </h4>
          <div style="background: #fff8f8; padding: 20px; border-radius: 10px; border-left: 4px solid #dc3545;">
            ${data.communicationAvoid.map(avoid => `<p style="margin: 8px 0; font-size: 15px;">• ${avoid}</p>`).join('')}
          </div>` : ''}
        </div>` : ''}

        ${data.stressManagement.length > 0 ? `
        <!-- Stress Management -->
        <div style="background: white; padding: 30px; border-left: 4px solid #fd7e14;">
          <h3 style="color: #fd7e14; margin-top: 0; font-size: 20px; display: flex; align-items: center;">
            <span style="background: linear-gradient(135deg, #fd7e14 0%, #e55a00 100%); color: white; padding: 8px 12px; border-radius: 8px; margin-right: 12px; font-size: 16px;">🧘</span>
            ${titles.stressManagementTitle}
          </h3>
          <div style="background: #fffbf8; padding: 20px; border-radius: 10px; border-left: 4px solid #fd7e14;">
            ${data.stressManagement.map(technique => `<p style="margin: 8px 0; font-size: 15px;">• ${technique}</p>`).join('')}
          </div>
        </div>` : ''}

        ${data.decisionMaking.length > 0 ? `
        <!-- Decision Making -->
        <div style="background: white; padding: 30px; border-left: 4px solid #20c997;">
          <h3 style="color: #20c997; margin-top: 0; font-size: 20px; display: flex; align-items: center;">
            <span style="background: linear-gradient(135deg, #20c997 0%, #17a2b8 100%); color: white; padding: 8px 12px; border-radius: 8px; margin-right: 12px; font-size: 16px;">🎯</span>
            ${titles.decisionMakingTitle}
          </h3>
          <div style="background: #f8fffd; padding: 20px; border-radius: 10px; border-left: 4px solid #20c997;">
            ${data.decisionMaking.map(support => `<p style="margin: 8px 0; font-size: 15px;">• ${support}</p>`).join('')}
          </div>
        </div>` : ''}

        ${data.psychologyBased.length > 0 ? `
        <!-- Psychology-Based Approaches -->
        <div style="background: white; padding: 30px; border-left: 4px solid #e83e8c;">
          <h3 style="color: #e83e8c; margin-top: 0; font-size: 20px; display: flex; align-items: center;">
            <span style="background: linear-gradient(135deg, #e83e8c 0%, #d91a72 100%); color: white; padding: 8px 12px; border-radius: 8px; margin-right: 12px; font-size: 16px;">🧠</span>
            ${titles.psychologyBasedTitle}
          </h3>
          <div style="background: #fff8fc; padding: 20px; border-radius: 10px; border-left: 4px solid #e83e8c;">
            ${data.psychologyBased.map(approach => `<p style="margin: 8px 0; font-size: 15px;">• ${approach}</p>`).join('')}
          </div>
        </div>` : ''}

        <!-- Footer -->
        <div style="background: linear-gradient(135deg, #343a40 0%, #495057 100%); padding: 30px; text-align: center; border-radius: 0 0 12px 12px;">
          <p style="color: white; margin: 0; font-size: 14px; opacity: 0.9;">This comprehensive report was generated by REQUITY</p>
          <p style="color: white; margin: 10px 0 0 0; font-size: 12px; opacity: 0.7;">Building Better Professional Relationships Through Personality Intelligence</p>
        </div>
      </div>
    `;
  }

  async sendClientReviewEmail(clientEmail: string, clientName: string, agentName: string, reviewLink: string): Promise<boolean> {
    if (!this.apiKey) {
      console.log(`[BREVO] Test mode - would send client review email to ${clientEmail}`);
      console.log(`[BREVO] Review link: ${reviewLink}`);
      return true;
    }

    try {
      const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <!-- Header with Logo -->
          <div style="text-align: center; padding: 30px 0; background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%); border-radius: 12px 12px 0 0;">
            <h1 style="color: white; font-size: 48px; margin: 0; letter-spacing: 2px;">REQUITY</h1>
            <p style="color: #e8f0ff; font-size: 14px; margin: 10px 0 0 0; letter-spacing: 1px;">BUILDING BETTER PROFESSIONAL RELATIONSHIPS</p>
          </div>

          <!-- Content -->
          <div style="background: #f8f9fa; padding: 40px 30px; border-radius: 0 0 12px 12px;">
            <h2 style="color: #333; font-size: 24px; margin-bottom: 20px;">Hello ${clientName || 'Valued Client'},</h2>
            
            <p style="color: #555; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
              We hope you had a great experience working with ${agentName}. Your feedback is incredibly valuable to us and helps improve the service you receive.
            </p>

            <p style="color: #555; font-size: 16px; line-height: 1.6; margin-bottom: 30px;">
              We've prepared a brief feedback form with just 4 questions that should take less than 5 minutes to complete.
            </p>

            <div style="text-align: center; margin: 30px 0;">
              <a href="${reviewLink}" style="display: inline-block; background: linear-gradient(135deg, #f97316 0%, #ea580c 100%); color: white; padding: 15px 40px; text-decoration: none; border-radius: 8px; font-size: 18px; font-weight: bold; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                Share Your Feedback
              </a>
            </div>

            <p style="color: #777; font-size: 14px; line-height: 1.6; margin-top: 30px;">
              Your honest feedback helps us ensure that ${agentName} continues to provide excellent service to all clients.
            </p>

            <p style="color: #555; font-size: 16px; line-height: 1.6; margin-top: 20px;">
              Thank you for your time!
            </p>
          </div>

          <!-- Footer -->
          <div style="text-align: center; padding: 20px 0; color: #999; font-size: 12px;">
            <p style="margin: 5px 0;">© 2025 REQUITY LLC. All rights reserved.</p>
            <p style="margin: 5px 0;">This email was sent because you recently completed a transaction with ${agentName}.</p>
          </div>
        </div>
      `;

      const payload = {
        to: [{ email: clientEmail, name: clientName || 'Client' }],
        sender: {
          name: 'REQUITY',
          email: process.env.BREVO_SENDER_EMAIL || 'info@requityapp.com'
        },
        subject: `${clientName ? clientName + ', ' : ''}Please Share Your Experience with ${agentName}`,
        htmlContent
      };

      const response = await fetch(`${this.baseUrl}/smtp/email`, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'api-key': this.apiKey
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        console.log(`[BREVO] Client review email sent successfully to ${clientEmail}`);
        return true;
      } else {
        const error = await response.text();
        console.error(`[BREVO] Failed to send client review email:`, error);
        return false;
      }
    } catch (error) {
      console.error('[BREVO] Error sending client review email:', error);
      return false;
    }
  }
  
  async sendReportEmail(recipientEmail: string, htmlContent: string, clientName: string): Promise<boolean> {
    if (!this.apiKey) {
      console.log(`[BREVO] Would send report email to: ${recipientEmail}`);
      return true;
    }

    try {
      const senderEmail = process.env.BREVO_SENDER_EMAIL || 'info@requityapp.com';

      const payload = {
        sender: {
          name: 'REQUITY',
          email: senderEmail
        },
        to: [{ email: recipientEmail }],
        subject: `${clientName ? clientName + "'s " : ""}Relational Roadmap™ Report`,
        htmlContent
      };

      const response = await fetch(`${this.baseUrl}/smtp/email`, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'api-key': this.apiKey
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        console.log(`[BREVO] Report email sent successfully to ${recipientEmail}`);
        return true;
      } else {
        const error = await response.text();
        console.error(`[BREVO] Failed to send report email:`, error);
        return false;
      }
    } catch (error) {
      console.error('[BREVO] Error sending report email:', error);
      return false;
    }
  }

  async sendAgentPairingNotification(
    agentEmail: string,
    agentName: string,
    clientName: string,
    clientArchetype: string,
    assessmentId: number,
    pdfBuffer?: Buffer
  ): Promise<boolean> {
    if (!this.apiKey) {
      console.log(`[BREVO] Would send agent pairing notification to: ${agentEmail}`);
      console.log(`[BREVO] Client: ${clientName}, Archetype: ${clientArchetype}`);
      return true;
    }

    try {
      const senderEmail = process.env.BREVO_SENDER_EMAIL || "hello@requityapp.com";

      const emailPayload: any = {
        sender: {
          name: "REQUITY",
          email: senderEmail
        },
        to: [{ email: agentEmail, name: agentName }],
        subject: `New Client Match: ${clientName}`,
        htmlContent: `
          <div style="max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <!-- REQUITY Logo Header -->
            <div style="background: white; padding: 30px; text-align: center; border-bottom: 3px solid #ff6a00;">
              <div style="font-size: 48px; font-weight: bold; color: #1e3a8a; margin-bottom: 5px;">
                RE<span style="color: #ff6a00;">Q</span>UITY
              </div>
              <div style="font-size: 14px; color: #666; letter-spacing: 2px;">BUILDING BETTER PROFESSIONAL RELATIONSHIPS</div>
            </div>
            
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 28px;">You Have a New Client Match!</h1>
              <p style="color: white; margin: 10px 0 0 0; opacity: 0.9;">A compatible client has paired with you</p>
            </div>
            
            <div style="padding: 40px 30px; background: white;">
              <h2 style="color: #333; margin-bottom: 20px;">Hello ${agentName},</h2>
              
              <p style="margin-bottom: 20px;">Great news! A new client has found you through REQUITY's Find an Agent feature and has chosen to pair with you.</p>
              
              <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h3 style="color: #333; margin-top: 0;">Client Information:</h3>
                <p style="margin: 10px 0;"><strong>Name:</strong> ${clientName}</p>
                <p style="margin: 10px 0;"><strong>Personality Type:</strong> ${clientArchetype}</p>
                <p style="margin: 10px 0;"><strong>Status:</strong> Potential Client</p>
              </div>
              
              <p style="margin-bottom: 30px;">This client was matched with you based on your compatible communication styles and working preferences. Their assessment shows they would work well with your professional approach.</p>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${process.env.VITE_PUBLIC_URL || 'https://requity.app'}/dashboard" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">View Client Details</a>
              </div>
              
              <div style="border-top: 1px solid #eee; padding-top: 20px; margin-top: 30px;">
                <p style="font-size: 14px; color: #666; margin-bottom: 10px;"><strong>Next Steps:</strong></p>
                <ol style="font-size: 14px; color: #666; margin: 0; padding-left: 20px;">
                  <li>Log in to your REQUITY dashboard to view the full client assessment</li>
                  <li>Review their personality profile and communication preferences</li>
                  <li>Reach out to establish contact and begin building your professional relationship</li>
                </ol>
              </div>
            </div>
            
            <div style="background: #f8f9fa; padding: 20px 30px; text-align: center; border-top: 1px solid #eee;">
              <p style="margin: 0; font-size: 14px; color: #666;">Best regards,<br>The REQUITY Team</p>
            </div>
          </div>
        `
      };

      // Add PDF attachment if provided
      if (pdfBuffer) {
        emailPayload.attachment = [{
          content: pdfBuffer.toString('base64'),
          name: `${clientName.replace(/[^a-zA-Z0-9]/g, '_')}_Assessment_Report.pdf`
        }];
        console.log(`[BREVO] Adding PDF attachment for ${clientName}`);
      }

      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': this.apiKey
        },
        body: JSON.stringify(emailPayload)
      });

      if (response.ok) {
        console.log(`[BREVO] Agent pairing notification sent successfully to ${agentEmail}`);
        return true;
      } else {
        const error = await response.text();
        console.error(`[BREVO] Failed to send agent pairing notification:`, error);
        return false;
      }
    } catch (error) {
      console.error('[BREVO] Error sending agent pairing notification:', error);
      return false;
    }
  }

  // Send notification to admins when new find-agent survey is completed
  async sendAdminFindAgentNotification(
    clientName: string,
    clientEmail: string,
    clientArchetype: string,
    assessmentId: number
  ): Promise<boolean> {
    if (!this.apiKey) {
      console.log(`[BREVO] Would send admin notification for find-agent survey completion`);
      console.log(`[BREVO] Client: ${clientName}, Email: ${clientEmail}, Archetype: ${clientArchetype}`);
      return true;
    }

    try {
      const senderEmail = process.env.BREVO_SENDER_EMAIL || "hello@requityapp.com";
      const dashboardUrl = `${process.env.VITE_PUBLIC_URL || 'https://requity.app'}/admin`;

      const emailPayload = {
        sender: {
          name: "REQUITY Platform",
          email: senderEmail
        },
        to: [{ email: "admin@requity.com", name: "Admin" }], // Send to admin
        subject: `New Find-Agent Survey Completed: ${clientName}`,
        htmlContent: `
          <div style="max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <!-- REQUITY Logo Header -->
            <div style="background: white; padding: 30px; text-align: center; border-bottom: 3px solid #ff6a00;">
              <div style="font-size: 48px; font-weight: bold; color: #1e3a8a; margin-bottom: 5px;">
                RE<span style="color: #ff6a00;">Q</span>UITY
              </div>
              <div style="font-size: 14px; color: #666; letter-spacing: 2px;">ADMIN NOTIFICATION</div>
            </div>
            
            <div style="background: linear-gradient(135deg, #ff6a00 0%, #e55a00 100%); padding: 30px; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 28px;">New Find-Agent Survey Completed</h1>
              <p style="color: white; margin: 10px 0 0 0; opacity: 0.9;">A client is waiting for agent assignment</p>
            </div>
            
            <div style="padding: 40px 30px; background: white;">
              <h2 style="color: #333; margin-bottom: 20px;">Action Required</h2>
              
              <p style="margin-bottom: 20px;">A new client has completed the "Find an Agent" survey and is waiting for you to assign a compatible agent.</p>
              
              <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h3 style="color: #333; margin-top: 0;">Client Details:</h3>
                <p style="margin: 10px 0;"><strong>Name:</strong> ${clientName}</p>
                <p style="margin: 10px 0;"><strong>Email:</strong> ${clientEmail}</p>
                <p style="margin: 10px 0;"><strong>Personality Type:</strong> ${clientArchetype}</p>
                <p style="margin: 10px 0;"><strong>Assessment ID:</strong> ${assessmentId}</p>
              </div>
              
              <p style="margin-bottom: 30px;">Please log in to the admin dashboard to review their assessment and assign the most compatible agent.</p>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${dashboardUrl}" style="background: linear-gradient(135deg, #ff6a00 0%, #e55a00 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Assign Agent Now</a>
              </div>
              
              <div style="border-top: 1px solid #eee; padding-top: 20px; margin-top: 30px;">
                <p style="font-size: 14px; color: #666; margin-bottom: 10px;"><strong>Next Steps:</strong></p>
                <ol style="font-size: 14px; color: #666; margin: 0; padding-left: 20px;">
                  <li>Review the client's personality assessment results</li>
                  <li>Check agent compatibility scores and availability</li>
                  <li>Manually assign the best-matched agent to this client</li>
                  <li>The assigned agent will be automatically notified</li>
                </ol>
              </div>
            </div>
            
            <div style="background: #f8f9fa; padding: 20px 30px; text-align: center; border-top: 1px solid #eee;">
              <p style="margin: 0; font-size: 14px; color: #666;">This is an automated notification from the REQUITY platform</p>
            </div>
          </div>
        `
      };

      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': this.apiKey
        },
        body: JSON.stringify(emailPayload)
      });

      if (response.ok) {
        console.log(`[BREVO] Admin find-agent notification sent successfully for ${clientName}`);
        return true;
      } else {
        const error = await response.text();
        console.error(`[BREVO] Failed to send admin find-agent notification:`, error);
        return false;
      }
    } catch (error) {
      console.error('[BREVO] Error sending admin find-agent notification:', error);
      return false;
    }
  }

  async sendAssessmentStartedNotification(
    agentEmail: string,
    agentName: string,
    clientName: string,
    clientEmail: string,
    assessmentId: number
  ): Promise<boolean> {
    if (!this.apiKey) {
      console.log(`[BREVO] Would send assessment started notification to: ${agentEmail} for client: ${clientName}`);
      return true;
    }

    try {
      const emailData = {
        sender: {
          name: "REQUITY Platform",
          email: process.env.BREVO_SENDER_EMAIL || "hello@requityapp.com"
        },
        to: [{ email: agentEmail, name: agentName }],
        subject: `🎯 ${clientName} has started their REQUITY assessment`,
        htmlContent: `
          <div style="max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <!-- REQUITY Logo Header -->
            <div style="background: white; padding: 30px; text-align: center; border-bottom: 3px solid #ff6a00;">
              <div style="font-size: 48px; font-weight: bold; color: #1e3a8a; margin-bottom: 5px;">
                RE<span style="color: #ff6a00;">Q</span>UITY
              </div>
              <div style="font-size: 14px; color: #666; letter-spacing: 2px;">BUILDING BETTER PROFESSIONAL RELATIONSHIPS</div>
            </div>
            
            <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 28px;">🎯 Assessment Started!</h1>
              <p style="color: white; margin: 10px 0 0 0; opacity: 0.9;">A new client has begun their relational assessment</p>
            </div>
            
            <div style="padding: 40px 30px; background: white;">
              <h2 style="color: #333; margin-bottom: 20px;">Hello ${agentName},</h2>
              
              <p style="margin-bottom: 20px;">Great news! <strong>${clientName}</strong> has just started their REQUITY assessment and provided their contact information.</p>
              
              <div style="background: #f0fdf4; border-left: 4px solid #10b981; padding: 25px; margin: 20px 0;">
                <h3 style="color: #059669; margin-top: 0; font-size: 18px;">📋 Client Details</h3>
                <ul style="margin: 15px 0; padding-left: 0; list-style: none;">
                  <li style="margin-bottom: 10px; padding: 8px 0; border-bottom: 1px solid #d1fae5;">
                    <strong>Name:</strong> ${clientName}
                  </li>
                  <li style="margin-bottom: 10px; padding: 8px 0; border-bottom: 1px solid #d1fae5;">
                    <strong>Email:</strong> ${clientEmail}
                  </li>
                  <li style="margin-bottom: 0; padding: 8px 0;">
                    <strong>Status:</strong> Assessment in Progress
                  </li>
                </ul>
              </div>
              
              <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 20px; margin: 25px 0;">
                <h4 style="color: #92400e; margin-top: 0;">⏰ Next Steps</h4>
                <ul style="color: #92400e; margin-bottom: 0;">
                  <li>The client is currently completing their personality assessment</li>
                  <li>You'll receive another notification when they finish</li>
                  <li>Their personalized report will be automatically generated</li>
                  <li>You can track progress in your REQUITY dashboard</li>
                </ul>
              </div>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="https://requityapp.com/dashboard" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block; box-shadow: 0 4px 6px rgba(16, 185, 129, 0.3);">View Dashboard</a>
              </div>
              
              <div style="border-top: 1px solid #eee; padding-top: 20px; margin-top: 30px;">
                <p style="font-size: 14px; color: #999; margin-bottom: 10px;">💡 <strong>Pro Tip:</strong> Be ready to follow up once they complete the assessment - clients are most engaged immediately after receiving their results.</p>
                <p style="font-size: 14px; color: #999; margin-bottom: 0;">This is an automated notification from REQUITY. You're receiving this because ${clientName} used your assessment link.</p>
              </div>
            </div>
            
            <div style="background: #f8f9fa; padding: 20px 30px; border-top: 1px solid #eee; text-align: center;">
              <p style="margin: 0; font-size: 14px; color: #666;">
                © 2025 REQUITY Platform. Building better professional relationships.
              </p>
            </div>
          </div>
        `
      };

      const response = await fetch(`${this.baseUrl}/smtp/email`, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'api-key': this.apiKey
        },
        body: JSON.stringify(emailData)
      });

      if (response.ok) {
        console.log(`[BREVO] Assessment started notification sent to: ${agentEmail} for client: ${clientName}`);
        return true;
      } else {
        const errorText = await response.text();
        console.error(`[BREVO] Failed to send assessment started notification - Status: ${response.status}`);
        console.error(`[BREVO] Error response:`, errorText);
        return false;
      }
    } catch (error) {
      console.error('[BREVO] Error sending assessment started notification:', error);
      return false;
    }
  }

  // Send tenant user credentials email
  async sendTenantCredentialsEmail(
    tenant: { id: string; name: string; logoUrl?: string; primaryColor?: string; fromEmail?: string },
    user: { email: string; firstName?: string; lastName?: string },
    password: string
  ): Promise<boolean> {
    if (!this.apiKey) {
      console.log(`[BREVO] Would send credentials to: ${user.email}`);
      console.log(`[BREVO] Tenant: ${tenant.name}`);
      return true;
    }

    try {
      console.log('[BREVO] sendTenantCredentialsEmail called');
      console.log('[BREVO] User email:', user.email);
      console.log('[BREVO] Tenant:', tenant.name, 'ID:', tenant.id);
      console.log('[BREVO] Password provided:', password ? 'Yes' : 'No');
      
      const loginUrl = `${process.env.APP_URL || 'https://requityapp.com'}/tenant/${tenant.id}/login`;
      const userName = user.firstName || user.email.split('@')[0];
      const primaryColor = tenant.primaryColor || '#667eea';
      
      const emailData = {
        sender: {
          name: tenant.name,
          email: tenant.fromEmail || this.senderEmail
        },
        to: [{ email: user.email, name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || undefined }],
        subject: `Welcome to ${tenant.name} - Your Login Credentials`,
        htmlContent: `
          <div style="max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <!-- Header with Logo -->
            <div style="background: white; padding: 30px; text-align: center; border-bottom: 3px solid ${primaryColor};">
              ${tenant.logoUrl ? `
                <img src="${tenant.logoUrl}" alt="${tenant.name}" style="max-height: 60px; max-width: 200px; margin-bottom: 10px;">
              ` : `
                <div style="font-size: 32px; font-weight: bold; color: ${primaryColor}; margin-bottom: 10px;">
                  ${tenant.name}
                </div>
              `}
              <div style="font-size: 14px; color: #666; letter-spacing: 1px;">Powered by REQUITY</div>
            </div>
            
            <div style="background: linear-gradient(135deg, ${primaryColor} 0%, ${primaryColor}dd 100%); padding: 30px; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 28px;">Welcome to ${tenant.name}</h1>
              <p style="color: white; margin: 10px 0 0 0; opacity: 0.9;">Your account has been created</p>
            </div>
            
            <div style="padding: 40px 30px; background: white;">
              <h2 style="color: #333; margin-bottom: 20px;">Hello ${userName},</h2>
              
              <p style="margin-bottom: 20px;">Your account has been created for the ${tenant.name} platform. Here are your login credentials:</p>
              
              <div style="background: #f8f9fa; padding: 25px; border-radius: 12px; margin: 30px 0; border: 1px solid #e0e0e0;">
                <h3 style="color: ${primaryColor}; margin-top: 0; font-size: 18px;">Your Login Credentials</h3>
                
                <div style="margin: 20px 0;">
                  <div style="color: #666; font-size: 14px; margin-bottom: 5px;">Username (Email):</div>
                  <div style="font-size: 16px; font-weight: bold; color: #333; font-family: monospace; background: white; padding: 10px; border-radius: 6px; border: 1px solid #ddd;">
                    ${user.email}
                  </div>
                </div>
                
                <div style="margin: 20px 0;">
                  <div style="color: #666; font-size: 14px; margin-bottom: 5px;">Temporary Password:</div>
                  <div style="font-size: 18px; font-weight: bold; color: ${primaryColor}; letter-spacing: 2px; font-family: monospace; background: white; padding: 10px; border-radius: 6px; border: 1px solid #ddd;">
                    ${password}
                  </div>
                </div>
              </div>
              
              <div style="text-align: center; margin: 40px 0;">
                <a href="${loginUrl}" style="display: inline-block; padding: 14px 32px; background: ${primaryColor}; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">
                  Login to Your Account
                </a>
              </div>
              
              <div style="border-top: 1px solid #eee; padding-top: 20px; margin-top: 30px;">
                <p style="font-size: 14px; color: #999; margin-bottom: 10px;">
                  <strong>⚠️ Security Note:</strong> Please change your password after your first login for enhanced security.
                </p>
                <p style="font-size: 14px; color: #999; margin-bottom: 10px;">
                  <strong>Login URL:</strong> <a href="${loginUrl}" style="color: ${primaryColor};">${loginUrl}</a>
                </p>
              </div>
            </div>
            
            <div style="background: #f8f9fa; padding: 20px 30px; text-align: center; border-top: 1px solid #eee;">
              <p style="margin: 0; font-size: 14px; color: #666;">
                If you have any questions, please contact your administrator.
                <br><br>
                Best regards,<br>The ${tenant.name} Team
              </p>
            </div>
          </div>
        `
      };

      console.log('[BREVO] Sending credentials email with:', {
        to: emailData.to,
        subject: emailData.subject,
        sender: emailData.sender,
        hasPassword: !!password
      });

      const response = await fetch(`${this.baseUrl}/smtp/email`, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'api-key': this.apiKey
        },
        body: JSON.stringify(emailData)
      });

      const responseText = await response.text();
      console.log('[BREVO] Response status:', response.status);
      console.log('[BREVO] Response body:', responseText);

      if (response.ok) {
        console.log(`[BREVO] SUCCESS: Credentials email sent to: ${user.email} for tenant: ${tenant.name}`);
        return true;
      } else {
        console.error(`[BREVO] FAILED: Failed to send credentials email - Status: ${response.status}`);
        console.error(`[BREVO] Error response:`, responseText);
        return false;
      }
    } catch (error) {
      console.error('[BREVO] Error sending credentials email:', error);
      return false;
    }
  }

  // Send REQUITY platform invitation email with credentials
  async sendPlatformInvitationEmail(
    email: string,
    details: {
      firstName: string;
      lastName: string;
      tempPassword: string;
      tenantName: string;
      tenantId: string;
      isNewPlatformUser: boolean;
    }
  ): Promise<boolean> {
    if (!this.apiKey) {
      console.log(`[BREVO] Would send platform invitation to: ${email}`);
      return true;
    }

    try {
      const userName = details.firstName || email.split('@')[0];
      const loginUrl = `${process.env.APP_URL || 'https://requityapp.com'}/login`;
      const tenantUrl = `${process.env.APP_URL || 'https://requityapp.com'}/tenant/${details.tenantId}/login`;
      
      const emailData = {
        sender: {
          name: 'REQUITY Platform',
          email: this.senderEmail
        },
        to: [{ email, name: `${details.firstName} ${details.lastName}`.trim() || undefined }],
        subject: `Welcome to REQUITY - Your Account Has Been Created`,
        htmlContent: `
          <div style="max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <!-- Header -->
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 30px; text-align: center; border-radius: 10px 10px 0 0;">
              <h1 style="color: white; margin: 0; font-size: 32px; font-weight: 600;">Welcome to REQUITY</h1>
              <p style="color: rgba(255, 255, 255, 0.9); margin: 10px 0 0 0; font-size: 16px;">Your Professional Real Estate Platform</p>
            </div>
            
            <!-- Content -->
            <div style="padding: 40px 30px; background: white; border: 1px solid #e0e0e0; border-top: none;">
              <h2 style="color: #333; margin-bottom: 10px;">Hello ${userName},</h2>
              
              <p style="color: #666; margin-bottom: 25px;">
                You've been invited to join <strong>${details.tenantName}</strong> on the REQUITY platform. 
                Your account has been created and you can now access both the main REQUITY platform and your organization's portal.
              </p>
              
              <!-- Credentials Box -->
              <div style="background: #f8f9fa; border-left: 4px solid #667eea; padding: 20px; margin: 25px 0; border-radius: 5px;">
                <h3 style="color: #333; margin-top: 0; margin-bottom: 15px;">Your Login Credentials</h3>
                <p style="margin: 10px 0;">
                  <strong style="color: #555;">Email:</strong> 
                  <span style="color: #333; font-family: monospace; background: #fff; padding: 3px 8px; border-radius: 3px;">${email}</span>
                </p>
                <p style="margin: 10px 0;">
                  <strong style="color: #555;">Temporary Password:</strong> 
                  <span style="color: #333; font-family: monospace; background: #fff; padding: 3px 8px; border-radius: 3px; font-size: 14px;">${details.tempPassword}</span>
                </p>
              </div>
              
              <!-- Access Options -->
              <div style="background: #f0f4ff; padding: 20px; margin: 25px 0; border-radius: 5px;">
                <h3 style="color: #333; margin-top: 0;">You can access:</h3>
                <ul style="color: #666; margin: 10px 0; padding-left: 20px;">
                  <li style="margin: 8px 0;">
                    <strong>REQUITY Main Platform:</strong> Full access to assessments, client management, and professional tools
                  </li>
                  <li style="margin: 8px 0;">
                    <strong>${details.tenantName} Portal:</strong> Organization-specific features and resources
                  </li>
                </ul>
              </div>
              
              <!-- CTA Buttons -->
              <div style="text-align: center; margin: 35px 0;">
                <a href="${loginUrl}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 35px; text-decoration: none; border-radius: 5px; font-weight: 600; margin: 0 10px;">
                  Login to REQUITY
                </a>
                <a href="${tenantUrl}" style="display: inline-block; background: white; color: #667eea; padding: 14px 35px; text-decoration: none; border-radius: 5px; font-weight: 600; margin: 0 10px; border: 2px solid #667eea;">
                  Visit ${details.tenantName} Portal
                </a>
              </div>
              
              <!-- Security Note -->
              <div style="background: #fff3cd; border: 1px solid #ffc107; padding: 15px; border-radius: 5px; margin: 25px 0;">
                <p style="color: #856404; margin: 0; font-size: 14px;">
                  <strong>⚠️ Security Note:</strong> Please change your password after your first login. Your temporary password will expire in 7 days.
                </p>
              </div>
              
              <!-- Footer -->
              <div style="border-top: 1px solid #e0e0e0; margin-top: 35px; padding-top: 20px; text-align: center;">
                <p style="color: #999; font-size: 14px; margin: 5px 0;">
                  Need help? Contact support at support@requityapp.com
                </p>
                <p style="color: #999; font-size: 12px; margin: 10px 0;">
                  © ${new Date().getFullYear()} REQUITY. All rights reserved.
                </p>
              </div>
            </div>
          </div>
        `
      };

      const response = await fetch(`${this.baseUrl}/smtp/email`, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'api-key': this.apiKey
        },
        body: JSON.stringify(emailData)
      });

      if (response.ok) {
        console.log(`[BREVO] Platform invitation sent to: ${email}`);
        return true;
      } else {
        const errorText = await response.text();
        console.error(`[BREVO] Failed to send platform invitation - Status: ${response.status}`);
        console.error(`[BREVO] Error response:`, errorText);
        return false;
      }
    } catch (error) {
      console.error('[BREVO] Error sending platform invitation:', error);
      return false;
    }
  }

  // Generic transactional email method for tenant invitations
  async sendTransactionalEmail(params: {
    to: Array<{email: string, name?: string}>,
    subject: string,
    htmlContent: string,
    sender?: {email: string, name: string}
  }): Promise<boolean> {
    if (!this.apiKey) {
      console.log(`[BREVO] Would send email to: ${params.to.map(r => r.email).join(', ')}`);
      return true;
    }

    try {
      const emailData = {
        sender: params.sender || { name: 'REQUITY Platform', email: this.senderEmail },
        to: params.to,
        subject: params.subject,
        htmlContent: params.htmlContent
      };

      const response = await fetch(`${this.baseUrl}/smtp/email`, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'api-key': this.apiKey
        },
        body: JSON.stringify(emailData)
      });

      if (response.ok) {
        console.log(`[BREVO] Email sent to: ${params.to.map(r => r.email).join(', ')}`);
        return true;
      } else {
        const errorText = await response.text();
        console.error(`[BREVO] Failed to send email - Status: ${response.status}`);
        console.error(`[BREVO] Error response:`, errorText);
        return false;
      }
    } catch (error) {
      console.error('[BREVO] Error sending email:', error);
      return false;
    }
  }
}

export const brevoService = new BrevoService();