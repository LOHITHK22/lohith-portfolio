import { profile } from "@/data/profile";

/**
 * Generates a vCard (.vcf) client-side from profile data and triggers a
 * download via a Blob URL. No external service involved.
 */
export function downloadVCard(): void {
  const [firstName, ...rest] = profile.name.split(" ");
  const lastName = rest.join(" ");

  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `N:${lastName};${firstName};;;`,
    `FN:${profile.name}`,
    `TITLE:${profile.headline}`,
    `EMAIL;TYPE=INTERNET:${profile.email}`,
    `TEL;TYPE=CELL:${profile.phoneForVCardOnly}`,
    `URL;TYPE=LinkedIn:${profile.linkedinUrl}`,
    `URL;TYPE=GitHub:${profile.githubUrl}`,
    `ADR;TYPE=WORK:;;${profile.location};;;;`,
    "END:VCARD",
  ];

  const vcfContent = lines.join("\r\n");
  const blob = new Blob([vcfContent], { type: "text/vcard;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = "Lohith_Kovuri.vcf";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
