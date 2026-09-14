// Every address is read from the environment; nothing is hardcoded.
export const cfg = {
  port: Number(process.env.PORT || 4173),
  databaseUrl:
    process.env.DATABASE_URL ||
    "postgresql://deku_app:deku-local-dev@postgres:5432/deku",
  authIssuerUrl: process.env.AUTH_ISSUER_URL,
  authClientId: process.env.AUTH_CLIENT_ID,
  authClientSecret: process.env.AUTH_CLIENT_SECRET,
  smtpHost: process.env.SMTP_HOST,
  smtpPort: Number(process.env.SMTP_PORT || 1025),
  appPublicUrl: process.env.APP_PUBLIC_URL || "https://ravel.example.com",
  retentionSchemeMonths: 120,
  retentionStatutoryMonths: 84,
  recordMonths: 180,
  sessionTtlSeconds: 43200,
};

// The sites a role is scoped to. A grant is dated and nothing renews silently;
// the seeded grants end on 2027-06-30 and are held beside the account.
export const roleScopes = {
  "plant@example.com": ["SITE-DEMO", "SITE-PILOT"],
  "analyst@example.com": ["SITE-DEMO", "SITE-PILOT"],
  "quality@example.com": ["SITE-DEMO", "SITE-PILOT"],
  "claims@example.com": ["SITE-DEMO", "SITE-PILOT"],
  "signer@example.com": ["SITE-DEMO", "SITE-PILOT"],
  "signer2@example.com": ["SITE-PILOT"],
  "auditor@example.com": ["SITE-DEMO", "SITE-PILOT"],
};

export const grantEndsOn = "2027-06-30";

export const roleLabels = {
  plant_operator: "Plant operator",
  lab_analyst: "Laboratory analyst",
  quality_manager: "Quality manager",
  claims_manager: "Claims manager",
  certificate_signer: "Certificate signer",
  auditor: "Auditor",
};

// What each role may do. Authorization is decided on the server for every
// mutating route, and this table is the whole of it.
export const permissions = {
  batch_create: ["plant_operator"],
  batch_patch: ["plant_operator"],
  batch_custody: ["plant_operator"],
  batch_reject: ["plant_operator"],
  collector_approval: ["quality_manager"],
  run_create: ["plant_operator"],
  run_consume: ["plant_operator"],
  run_output: ["plant_operator"],
  run_close: ["plant_operator"],
  test_create: ["lab_analyst"],
  disposition: ["quality_manager"],
  deviation_create: ["quality_manager"],
  deviation_close: ["quality_manager"],
  override_create: ["quality_manager", "claims_manager"],
  override_review: ["quality_manager", "claims_manager"],
  allocation_create: ["claims_manager"],
  transfer_create: ["claims_manager"],
  period_close: ["claims_manager"],
  restatement_create: ["claims_manager"],
  restatement_resolve: ["claims_manager"],
  factor_create: ["claims_manager"],
  carbon_publish: ["quality_manager"],
  carbon_recompute: ["quality_manager"],
  energy_retire: ["quality_manager", "claims_manager"],
  lot_blend: ["plant_operator"],
  certificate_preview: ["certificate_signer"],
  certificate_sign: ["certificate_signer"],
  certificate_withdraw: ["certificate_signer"],
  change_notice_create: ["quality_manager"],
  change_notify: ["quality_manager"],
  change_release: ["quality_manager"],
  specification_issue: ["quality_manager"],
  contract_allocate: ["claims_manager"],
  party_version: ["claims_manager"],
  certification_record: ["quality_manager"],
  inbound_record: ["plant_operator", "quality_manager", "lab_analyst"],
  export_create: ["auditor"],
  annotation_create: ["auditor"],
  legal_hold: ["auditor", "quality_manager"],
  record_expire: ["auditor"],
  enquiry_create: [],
};

export function may(roles, action) {
  return roles.some((r) => (permissions[action] || []).includes(r));
}
