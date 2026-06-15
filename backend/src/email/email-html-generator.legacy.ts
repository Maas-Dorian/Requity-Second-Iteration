import { Assessment, Agent } from "../shared/schema";
import { storage } from "./storage";
import { getArchetypeDisplayName } from "../client/src/lib/archetype-mapping";

interface ArchetypeData {
  name: string;
  summary: string;
  keyTraits: string[];
  buyerApproach: string[];
  buyerAvoid: string;
  sellerApproach: string[];
  sellerAvoid: string;
  simultaneousApproach: string[];
  simultaneousAvoid: string;
  communicationRecommended: string[];
  communicationAvoid: string[];
  whatClientIsAfter: string[];
  appreciationStyle: string[];
  idealExperience: string[];
  psychologyBased: string[];
}

async function getArchetypeData(archetype: string): Promise<ArchetypeData> {
  try {
    const templates = await storage.getPublishedArchetypeTemplates();
    const displayName = getArchetypeDisplayName(archetype);
    const template = templates.find(t => 
      t.displayName.toLowerCase() === displayName.toLowerCase()
    );
    
    if (template) {
      const buyerAvoidStr = typeof template.buyerAvoid === 'string' ? 
        template.buyerAvoid : template.buyerAvoid?.join(', ') || '';
        
      const sellerAvoidStr = typeof template.sellerAvoid === 'string' ? 
        template.sellerAvoid : template.sellerAvoid?.join(', ') || '';
        
      const simultaneousAvoidStr = typeof template.simultaneousAvoid === 'string' ? 
        template.simultaneousAvoid : template.simultaneousAvoid?.join(', ') || '';
      
      return {
        name: template.displayName,
        summary: template.summary || "A unique personality profile",
        keyTraits: template.keyTraits || [],
        buyerApproach: template.buyerApproaches || [],
        buyerAvoid: buyerAvoidStr,
        sellerApproach: template.sellerApproaches || [],
        sellerAvoid: sellerAvoidStr,
        simultaneousApproach: template.simultaneousApproaches || [],
        simultaneousAvoid: simultaneousAvoidStr,
        communicationRecommended: template.communicationRecommended || [],
        communicationAvoid: template.communicationAvoid || [],
        whatClientIsAfter: template.whatClientIsAfter || [],
        appreciationStyle: [],
        idealExperience: template.idealExperience || [],
        psychologyBased: template.psychologyBased || []
      };
    }
  } catch (error) {
    console.error('Error fetching archetype template:', error);
  }
  
  // Fallback data
  return {
    name: getArchetypeDisplayName(archetype),
    summary: "A unique personality profile with distinctive characteristics",
    keyTraits: ["Values collaboration", "Seeks consensus", "Appreciates quality"],
    buyerApproach: ["Present options clearly", "Allow time for consideration"],
    buyerAvoid: "High-pressure tactics, rushing decisions",
    sellerApproach: ["Stage home attractively", "Highlight unique features"],
    sellerAvoid: "Rushing the process, neglecting presentation",
    simultaneousApproach: ["Balance both transactions", "Create clear timelines"],
    simultaneousAvoid: "Mixing priorities, creating confusion",
    communicationRecommended: ["Clear and patient communication", "Regular updates"],
    communicationAvoid: ["Technical jargon", "Information overload"],
    whatClientIsAfter: ["Clear communication", "Professional service", "Successful outcome"],
    appreciationStyle: ["Personal recognition", "Thoughtful gestures"],
    idealExperience: ["Smooth process", "Clear expectations", "Professional guidance"],
    psychologyBased: ["Understand their perspective", "Adapt to their style"]
  };
}

export async function generateAssessmentEmailHTML(
  assessment: Assessment,
  agent: Agent
): Promise<string> {
  const archetypeData = await getArchetypeData(assessment.archetype || 'Unknown');
  const displayName = getArchetypeDisplayName(assessment.archetype || 'Unknown');
  
  // Generate the report URL
  const baseUrl = process.env.NODE_ENV === 'production' ? 'https://requityapp.com' : 'http://localhost:5000';
  const reportUrl = `${baseUrl}/report/${assessment.reportToken}`;
  
  const transactionDisplay = assessment.transactionType === "buy" ? "Buying" : 
                            assessment.transactionType === "sell" ? "Selling" : 
                            assessment.transactionType === "both" ? "Buying & Selling" :
                            assessment.transactionType === "other" && assessment.transactionTypeOther ? 
                            assessment.transactionTypeOther : "Not Specified";

  // Ultra-simple HTML for maximum compatibility
  const htmlContent = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Your Relational Roadmap Report</title>
</head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f5f5f5;">

<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f5f5f5">
<tr>
<td align="center" style="padding:20px;">

<!-- Main Content Table -->
<table width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="max-width:600px;width:100%;">

<!-- Header -->
<tr>
<td bgcolor="#ff6a00" height="4"></td>
</tr>

<!-- Title -->
<tr>
<td style="padding:30px 20px;background:#ffffff;">
<h1 style="margin:0;color:#1f2937;font-size:24px;">Relational Roadmap Report</h1>
<p style="margin:10px 0 0 0;color:#666;font-size:14px;">
<b>Client:</b> ${assessment.clientName}<br>
<b>Date:</b> ${new Date(assessment.completedAt!).toLocaleDateString()}<br>
${assessment.transactionType ? `<b>Transaction:</b> ${transactionDisplay}` : ''}
</p>
</td>
</tr>

<!-- Archetype Section -->
<tr>
<td style="padding:0 20px 20px 20px;">
<table width="100%" cellpadding="15" cellspacing="0" border="0" bgcolor="#e3f2fd" style="border-radius:8px;">
<tr>
<td>
<h2 style="margin:0 0 10px 0;color:#1976d2;font-size:20px;">${displayName}</h2>
<p style="margin:0;color:#333;font-size:14px;"><b>Your Client Archetype</b></p>
</td>
</tr>
</table>
</td>
</tr>

<!-- Contact Info -->
<tr>
<td style="padding:0 20px 20px 20px;">
<table width="100%" cellpadding="15" cellspacing="0" border="0" bgcolor="#f5f5f5">
<tr>
<td>
<h3 style="margin:0 0 10px 0;color:#333;font-size:16px;">Contact Information</h3>
<p style="margin:0;color:#555;font-size:14px;line-height:20px;">
<b>Name:</b> ${assessment.clientName}<br>
<b>Email:</b> ${assessment.clientEmail}<br>
${assessment.clientPhone ? `<b>Phone:</b> ${assessment.clientPhone}<br>` : ''}
${assessment.clientBirthday ? `<b>Birthday:</b> ${assessment.clientBirthday}` : ''}
</p>
</td>
</tr>
</table>
</td>
</tr>

<!-- What Client Is After -->
<tr>
<td style="padding:0 20px 20px 20px;">
<table width="100%" cellpadding="15" cellspacing="0" border="0" bgcolor="#e8f5e9">
<tr>
<td>
<h3 style="margin:0 0 15px 0;color:#2e7d32;font-size:16px;">What This Client Is After</h3>
${archetypeData.whatClientIsAfter.map(item => 
  `<p style="margin:0 0 8px 0;color:#333;font-size:14px;">• ${item}</p>`
).join('')}
</td>
</tr>
</table>
</td>
</tr>

<!-- Buyer Guidelines -->
<tr>
<td style="padding:0 20px 10px 20px;">
<table width="100%" cellpadding="15" cellspacing="0" border="0" style="border-left:4px solid #4caf50;">
<tr>
<td bgcolor="#e8f5e9">
<h3 style="margin:0 0 10px 0;color:#2e7d32;font-size:16px;">As a Buyer - Recommended Approaches</h3>
${archetypeData.buyerApproach.map(item => 
  `<p style="margin:0 0 5px 0;padding-left:15px;color:#333;font-size:14px;">• ${item}</p>`
).join('')}
</td>
</tr>
</table>
</td>
</tr>

<!-- Buyer Avoid Section -->
<tr>
<td style="padding:0 20px 20px 20px;">
<table width="100%" cellpadding="15" cellspacing="0" border="0" style="border:2px solid #ef5350;">
<tr>
<td bgcolor="#fff">
<h4 style="margin:0 0 8px 0;color:#333;font-size:15px;"><b>As a Buyer - Avoid:</b></h4>
<p style="margin:0;padding-left:15px;color:#555;font-size:14px;">${archetypeData.buyerAvoid}</p>
</td>
</tr>
</table>
</td>
</tr>

<!-- Seller Guidelines -->
<tr>
<td style="padding:0 20px 10px 20px;">
<table width="100%" cellpadding="15" cellspacing="0" border="0" style="border-left:4px solid #2196f3;">
<tr>
<td bgcolor="#e3f2fd">
<h3 style="margin:0 0 10px 0;color:#1565c0;font-size:16px;">As a Seller - Recommended Approaches</h3>
${archetypeData.sellerApproach.map(item => 
  `<p style="margin:0 0 5px 0;padding-left:15px;color:#333;font-size:14px;">• ${item}</p>`
).join('')}
</td>
</tr>
</table>
</td>
</tr>

<!-- Seller Avoid Section -->
<tr>
<td style="padding:0 20px 20px 20px;">
<table width="100%" cellpadding="15" cellspacing="0" border="0" style="border:2px solid #ef5350;">
<tr>
<td bgcolor="#fff">
<h4 style="margin:0 0 8px 0;color:#333;font-size:15px;"><b>As a Seller - Avoid:</b></h4>
<p style="margin:0;padding-left:15px;color:#555;font-size:14px;">${archetypeData.sellerAvoid}</p>
</td>
</tr>
</table>
</td>
</tr>

<!-- Both Guidelines -->
<tr>
<td style="padding:0 20px 10px 20px;">
<table width="100%" cellpadding="15" cellspacing="0" border="0" style="border-left:4px solid #9c27b0;">
<tr>
<td bgcolor="#f3e5f5">
<h3 style="margin:0 0 10px 0;color:#6a1b9a;font-size:16px;">Both Buy & Sell - Recommended Approaches</h3>
${archetypeData.simultaneousApproach.map(item => 
  `<p style="margin:0 0 5px 0;padding-left:15px;color:#333;font-size:14px;">• ${item}</p>`
).join('')}
</td>
</tr>
</table>
</td>
</tr>

<!-- Both Avoid Section -->
<tr>
<td style="padding:0 20px 20px 20px;">
<table width="100%" cellpadding="15" cellspacing="0" border="0" style="border:2px solid #ef5350;">
<tr>
<td bgcolor="#fff">
<h4 style="margin:0 0 8px 0;color:#333;font-size:15px;"><b>Both Buy & Sell - Avoid:</b></h4>
<p style="margin:0;padding-left:15px;color:#555;font-size:14px;">${archetypeData.simultaneousAvoid}</p>
</td>
</tr>
</table>
</td>
</tr>

<!-- Communication -->
<tr>
<td style="padding:0 20px 30px 20px;">
<h3 style="margin:0 0 15px 0;color:#333;font-size:18px;">Communication Guidelines</h3>

<!-- Recommended -->
<table width="100%" cellpadding="15" cellspacing="0" border="0" bgcolor="#e8f5e9" style="margin-bottom:15px;">
<tr>
<td>
<h4 style="margin:0 0 10px 0;color:#2e7d32;font-size:15px;">✓ Recommended</h4>
${archetypeData.communicationRecommended.map(item => 
  `<p style="margin:0 0 5px 0;color:#333;font-size:14px;">• ${item}</p>`
).join('')}
</td>
</tr>
</table>

<!-- Avoid -->
<table width="100%" cellpadding="15" cellspacing="0" border="0" style="border:2px solid #ef5350;">
<tr>
<td bgcolor="#fff">
<h4 style="margin:0 0 10px 0;color:#333;font-size:15px;">✗ Communication to Avoid</h4>
${archetypeData.communicationAvoid.map(item => 
  `<p style="margin:0 0 5px 0;color:#333;font-size:14px;">• ${item}</p>`
).join('')}
</td>
</tr>
</table>
</td>
</tr>

<!-- Appreciation Style -->
${assessment.appreciationStyle ? `
<tr>
<td style="padding:0 20px 20px 20px;">
<h3 style="margin:0 0 15px 0;color:#333;font-size:18px;">Client's Appreciation Style</h3>
<table width="100%" cellpadding="15" cellspacing="0" border="0" bgcolor="#f3e5f5" style="margin-bottom:15px;">
<tr>
<td>
<p style="margin:0 0 8px 0;color:#333;font-size:14px;"><strong>This client most appreciates:</strong></p>
<p style="margin:0;color:#333;font-size:14px;">${
  assessment.appreciationStyle === "words" ? "Uplifting Words - Recognition through sincere encouragement, positive feedback, or thoughtful praise. Clients feel seen when their achievements or progress are genuinely acknowledged." :
  assessment.appreciationStyle === "acts" ? "Proactive Assistance - Appreciation shown by anticipating needs and stepping in to help—handling details, smoothing obstacles, or making the client's journey easier." :
  assessment.appreciationStyle === "gifts" ? "Memorable Gestures - Recognition in the form of thoughtful tokens, surprises, or keepsakes. Small but meaningful acts demonstrate that clients are top-of-mind." :
  assessment.appreciationStyle === "time" ? "Dedicated Attention - Feeling valued when an agent invests focused, quality time—actively listening, being present, and checking in thoughtfully." :
  assessment.appreciationStyle === "gestures" ? "Personalized Celebrations - Recognition through unique, tailored touches—celebrating milestones and making moments feel special with creative, personal flair." :
  assessment.appreciationStyle
}</p>
</td>
</tr>
</table>
</td>
</tr>` : ''}

<!-- Open-Ended Response -->
${assessment.openEndedResponse ? `
<tr>
<td style="padding:0 20px 20px 20px;">
<h3 style="margin:0 0 15px 0;color:#333;font-size:18px;">Client's Expectations & Questions</h3>
<table width="100%" cellpadding="15" cellspacing="0" border="0" bgcolor="#fff3cd" style="margin-bottom:15px;border:1px solid #ffeaa7;">
<tr>
<td>
<p style="margin:0;color:#333;font-size:14px;">${assessment.openEndedResponse}</p>
</td>
</tr>
</table>
</td>
</tr>` : ''}


<!-- CTA Button -->
<tr>
<td align="center" style="padding:0 20px 40px 20px;">
<a href="${reportUrl}" style="display:inline-block;padding:15px 30px;background:#ff6a00;color:#ffffff;text-decoration:none;font-size:16px;font-weight:bold;border-radius:5px;">View Full Interactive Report</a>
</td>
</tr>

<!-- Footer -->
<tr>
<td bgcolor="#f5f5f5" style="padding:20px;text-align:center;">
<p style="margin:0;color:#666;font-size:12px;">
© ${new Date().getFullYear()} REQUITY - Building Better Professional Relationships<br>
This assessment was prepared by ${agent.name}
</p>
</td>
</tr>

</table>
<!-- End Main Content -->

</td>
</tr>
</table>

</body>
</html>`;

  // Return the HTML without line breaks in the actual HTML to avoid parsing issues
  return htmlContent.replace(/\n\s*/g, '');
}

// Agent assessment email generation
export async function generateAgentAssessmentEmailHTML(
  email: string,
  archetypeName: string,
  archetypeSummary: string,
  interaction: string,
  focus: string,
  stress: string,
  leadGen: { primary: string; secondary?: string },
  negotiation: { primary: string; secondary?: string },
  communication: { primary: string; secondary?: string },
  learning: { primary: string; secondary?: string },
  presentation: { primary: string; secondary?: string }
): Promise<string> {
  const baseUrl = process.env.NODE_ENV === 'production' ? 'https://requityapp.com' : 'http://localhost:5000';
  const signupUrl = `${baseUrl}/auth?signup=true`;
  
  const htmlContent = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Your REQUITY Agent Profile</title>
</head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f5f5f5;">

<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f5f5f5">
<tr>
<td align="center" style="padding:20px;">

<!-- Main Content Table -->
<table width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="max-width:600px;width:100%;">

<!-- Header -->
<tr>
<td bgcolor="#ff6a00" height="4"></td>
</tr>

<!-- Title -->
<tr>
<td style="padding:30px 20px;background:#ffffff;">
<h1 style="margin:0;color:#003A70;font-size:28px;">Your REQUITY Agent Profile</h1>
<p style="margin:10px 0 0 0;color:#666;font-size:14px;">
<b>Date:</b> ${new Date().toLocaleDateString()}<br>
<b>Email:</b> ${email}
</p>
</td>
</tr>

<!-- Archetype Section -->
<tr>
<td style="padding:0 20px 20px 20px;">
<table width="100%" cellpadding="20" cellspacing="0" border="0" style="background: linear-gradient(135deg, #003A70 0%, #0056A3 100%);border-radius:8px;">
<tr>
<td>
<h2 style="margin:0 0 10px 0;color:#ffffff;font-size:24px;">${archetypeName}</h2>
<p style="margin:0;color:#ffffff;font-size:15px;line-height:1.6;">${archetypeSummary}</p>
</td>
</tr>
</table>
</td>
</tr>

<!-- Professional Styles Section -->
<tr>
<td style="padding:0 20px 20px 20px;">
<h3 style="margin:0 0 20px 0;color:#003A70;font-size:20px;">Your Professional Styles</h3>

<!-- Lead Generation Style -->
<table width="100%" cellpadding="15" cellspacing="0" border="0" style="border-left:4px solid #ff6a00;margin-bottom:15px;" bgcolor="#fff7f0">
<tr>
<td>
<h4 style="margin:0 0 8px 0;color:#003A70;font-size:16px;">Lead Generation Style</h4>
<p style="margin:0;color:#333;font-size:14px;"><b>Primary:</b> ${leadGen.primary}</p>
${leadGen.secondary ? `<p style="margin:5px 0 0 0;color:#555;font-size:13px;"><b>Secondary:</b> ${leadGen.secondary}</p>` : ''}
</td>
</tr>
</table>

<!-- Negotiation Style -->
<table width="100%" cellpadding="15" cellspacing="0" border="0" style="border-left:4px solid #ff6a00;margin-bottom:15px;" bgcolor="#fff7f0">
<tr>
<td>
<h4 style="margin:0 0 8px 0;color:#003A70;font-size:16px;">Negotiation Style</h4>
<p style="margin:0;color:#333;font-size:14px;"><b>Primary:</b> ${negotiation.primary}</p>
${negotiation.secondary ? `<p style="margin:5px 0 0 0;color:#555;font-size:13px;"><b>Secondary:</b> ${negotiation.secondary}</p>` : ''}
</td>
</tr>
</table>

<!-- Communication Style -->
<table width="100%" cellpadding="15" cellspacing="0" border="0" style="border-left:4px solid #ff6a00;margin-bottom:15px;" bgcolor="#fff7f0">
<tr>
<td>
<h4 style="margin:0 0 8px 0;color:#003A70;font-size:16px;">Communication Style</h4>
<p style="margin:0;color:#333;font-size:14px;"><b>Primary:</b> ${communication.primary}</p>
${communication.secondary ? `<p style="margin:5px 0 0 0;color:#555;font-size:13px;"><b>Secondary:</b> ${communication.secondary}</p>` : ''}
</td>
</tr>
</table>

<!-- Learning Style -->
<table width="100%" cellpadding="15" cellspacing="0" border="0" style="border-left:4px solid #ff6a00;margin-bottom:15px;" bgcolor="#fff7f0">
<tr>
<td>
<h4 style="margin:0 0 8px 0;color:#003A70;font-size:16px;">Learning Style</h4>
<p style="margin:0;color:#333;font-size:14px;"><b>Primary:</b> ${learning.primary}</p>
${learning.secondary ? `<p style="margin:5px 0 0 0;color:#555;font-size:13px;"><b>Secondary:</b> ${learning.secondary}</p>` : ''}
</td>
</tr>
</table>

<!-- Presentation Style -->
<table width="100%" cellpadding="15" cellspacing="0" border="0" style="border-left:4px solid #ff6a00;margin-bottom:15px;" bgcolor="#fff7f0">
<tr>
<td>
<h4 style="margin:0 0 8px 0;color:#003A70;font-size:16px;">Presentation Style</h4>
<p style="margin:0;color:#333;font-size:14px;"><b>Primary:</b> ${presentation.primary}</p>
${presentation.secondary ? `<p style="margin:5px 0 0 0;color:#555;font-size:13px;"><b>Secondary:</b> ${presentation.secondary}</p>` : ''}
</td>
</tr>
</table>
</td>
</tr>

<!-- Winning Path -->
<tr>
<td style="padding:0 20px 20px 20px;">
<table width="100%" cellpadding="20" cellspacing="0" border="0" style="background: linear-gradient(to right, #eff6ff 0%, #ffedd5 100%);border-radius:8px;">
<tr>
<td>
<h3 style="margin:0 0 15px 0;color:#003A70;font-size:18px;">Your Winning Path to Success</h3>
<p style="margin:0 0 12px 0;color:#333;font-size:14px;"><b>Based on your profile, here are your top strategies:</b></p>
<p style="margin:0 0 8px 0;color:#333;font-size:14px;"><b>1. Lead Generation:</b> Focus on ${leadGen.primary} strategies. This is where you'll naturally excel.</p>
<p style="margin:0 0 8px 0;color:#333;font-size:14px;"><b>2. Negotiation:</b> Leverage your ${negotiation.primary} approach${negotiation.secondary ? ` while developing ${negotiation.secondary} skills for balance` : ''}.</p>
<p style="margin:0 0 8px 0;color:#333;font-size:14px;"><b>3. Communication:</b> Use your ${communication.primary} style to build trust and rapport.</p>
<p style="margin:0 0 8px 0;color:#333;font-size:14px;"><b>4. Growth:</b> Embrace your ${learning.primary} learning style for continuous development.</p>
<p style="margin:0;color:#333;font-size:14px;"><b>5. Presentations:</b> Showcase your ${presentation.primary} strengths in every client interaction.</p>
</td>
</tr>
</table>
</td>
</tr>

<!-- Special Offer CTA -->
<tr>
<td style="padding:0 20px 30px 20px;">
<table width="100%" cellpadding="20" cellspacing="0" border="0" style="border:4px solid #ff6a00;border-radius:8px;" bgcolor="#ffffff">
<tr>
<td align="center">
<h3 style="margin:0 0 15px 0;color:#003A70;font-size:22px;">🎁 Create Your Free Account & Get 3 Free Client Assessments!</h3>
<p style="margin:0 0 15px 0;color:#333;font-size:15px;">Sign up now to unlock:</p>
<p style="margin:0 0 5px 0;color:#333;font-size:14px;">✓ Full access to your agent dashboard</p>
<p style="margin:0 0 5px 0;color:#333;font-size:14px;">✓ Send 3 client assessments completely free</p>
<p style="margin:0 0 5px 0;color:#333;font-size:14px;">✓ Generate branded QR codes for listings</p>
<p style="margin:0 0 20px 0;color:#333;font-size:14px;">✓ Match clients to their perfect communication style</p>
<a href="${signupUrl}" style="display:inline-block;padding:18px 40px;background:linear-gradient(135deg, #ff6a00 0%, #ff8c61 100%);color:#ffffff;text-decoration:none;font-size:18px;font-weight:bold;border-radius:8px;box-shadow:0 4px 6px rgba(255,106,0,0.3);">Create Free Account Now</a>
</td>
</tr>
</table>
</td>
</tr>

<!-- Footer -->
<tr>
<td bgcolor="#f5f5f5" style="padding:20px;text-align:center;">
<p style="margin:0;color:#666;font-size:12px;">
© ${new Date().getFullYear()} REQUITY - Building Better Professional Relationships<br>
Transform your client relationships with personalized insights
</p>
</td>
</tr>

</table>
<!-- End Main Content -->

</td>
</tr>
</table>

</body>
</html>`;

  return htmlContent.replace(/\n\s*/g, '');
}