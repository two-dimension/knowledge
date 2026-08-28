import { headers } from "next/headers";
import type { Database } from "../db/database";

export type AccessContext = {
  userId: string;
  email: string;
  departments: string[];
  industries: string[];
  projects: string[];
  maxSensitivity: "内部" | "核心组";
  canExport: boolean;
  canDownloadAudio: boolean;
  localPreview: boolean;
};

type ProfileRow = {
  user_id: string;
  email: string;
  departments_json: string;
  industries_json: string;
  projects_json: string;
  max_sensitivity: "内部" | "核心组";
  can_export: number;
  can_download_audio: number;
};

type AccessRow = {
  conversation_id: string;
  department: string;
  industry_group: string;
  project_group: string;
  sensitivity: "内部" | "核心组";
};

function parseList(value: string) {
  try { return JSON.parse(value) as string[]; } catch { return []; }
}

export async function ensureAccessRows(db: Database) {
  await db.prepare(`INSERT OR IGNORE INTO conversation_access
    (conversation_id, department, industry_group, project_group, sensitivity)
    SELECT id, '投研部', industry, '二级市场', sensitivity FROM conversations`).run();
}

export async function getAccessContext(db: Database): Promise<AccessContext> {
  const requestHeaders = await headers();
  const userId = requestHeaders.get("oai-authenticated-user-id") || "local-preview";
  const email = requestHeaders.get("oai-authenticated-user-email") || "local@preview";
  const localPreview = userId === "local-preview";
  const profile = await db.prepare("SELECT * FROM user_access_profiles WHERE user_id = ?").bind(userId).first<ProfileRow>();

  if (!profile) {
    const defaults = {
      departments: ["投研部"],
      industries: ["*"],
      projects: ["二级市场"],
      maxSensitivity: "核心组" as const,
      canExport: true,
      canDownloadAudio: true,
    };
    if (!localPreview) {
      await db.prepare(`INSERT INTO user_access_profiles
        (user_id, email, departments_json, industries_json, projects_json, max_sensitivity, can_export, can_download_audio)
        VALUES (?, ?, ?, ?, ?, ?, 1, 1)`)
        .bind(userId, email, JSON.stringify(defaults.departments), JSON.stringify(defaults.industries), JSON.stringify(defaults.projects), defaults.maxSensitivity).run();
    }
    return { userId, email, ...defaults, localPreview };
  }

  return {
    userId: profile.user_id,
    email: profile.email,
    departments: parseList(profile.departments_json),
    industries: parseList(profile.industries_json),
    projects: parseList(profile.projects_json),
    maxSensitivity: profile.max_sensitivity,
    canExport: Boolean(profile.can_export),
    canDownloadAudio: Boolean(profile.can_download_audio),
    localPreview,
  };
}

export async function authorizedConversationIds(db: Database, access: AccessContext) {
  await ensureAccessRows(db);
  const rows = await db.prepare("SELECT * FROM conversation_access").all<AccessRow>();
  const sensitivityRank = { "内部": 1, "核心组": 2 } as const;
  return new Set(rows.results.filter((row) => {
    const departmentAllowed = access.departments.includes("*") || access.departments.includes(row.department);
    const industryAllowed = access.industries.includes("*") || access.industries.includes(row.industry_group);
    const projectAllowed = access.projects.includes("*") || access.projects.includes(row.project_group);
    const sensitivityAllowed = sensitivityRank[row.sensitivity] <= sensitivityRank[access.maxSensitivity];
    return departmentAllowed && industryAllowed && projectAllowed && sensitivityAllowed;
  }).map((row) => row.conversation_id));
}

export function accessSummary(access: AccessContext) {
  return {
    departments: access.departments,
    industries: access.industries,
    projects: access.projects,
    maxSensitivity: access.maxSensitivity,
    canExport: access.canExport,
    canDownloadAudio: access.canDownloadAudio,
  };
}
