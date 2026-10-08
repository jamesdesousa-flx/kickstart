/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { UploadedDocument } from "../types/artefacts";

export interface DriveFolderInfo {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  modifiedTime?: string;
}

export interface DriveFileItem {
  id: string;
  name: string;
  mimeType: string;
  size?: number;
  modifiedTime?: string;
  webViewLink?: string;
  iconLink?: string;
}

/**
 * Extracts a Google Drive Folder ID from a URL, share link, or raw ID
 */
export function extractDriveFolderId(input: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();

  // Pattern 1: drive.google.com/drive/folders/{folderId} or /drive/u/0/folders/{folderId}
  const folderUrlMatch = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (folderUrlMatch && folderUrlMatch[1]) {
    return folderUrlMatch[1];
  }

  // Pattern 2: ?id={folderId}
  const idParamMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idParamMatch && idParamMatch[1]) {
    return idParamMatch[1];
  }

  // Pattern 3: Raw alphanumeric ID with optional underscores and hyphens (usually 15-50 chars)
  if (/^[a-zA-Z0-9_-]{15,60}$/.test(trimmed)) {
    return trimmed;
  }

  return null;
}

/**
 * Retrieve metadata for a specific Google Drive folder
 */
export async function getDriveFolderDetails(
  folderId: string,
  accessToken: string
): Promise<DriveFolderInfo> {
  const url = `https://www.googleapis.com/drive/v3/files/${folderId}?fields=id,name,mimeType,webViewLink,modifiedTime&supportsAllDrives=true`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errText = await response.text();
    if (response.status === 404) {
      throw new Error("Folder not found. Please check the folder link or permissions.");
    }
    if (response.status === 403 || response.status === 401) {
      throw new Error("Access denied. Please check that you have permission to view this Google Drive folder.");
    }
    throw new Error(`Google Drive API error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  return {
    id: data.id,
    name: data.name || "Untitled Folder",
    mimeType: data.mimeType || "application/vnd.google-apps.folder",
    webViewLink: data.webViewLink,
    modifiedTime: data.modifiedTime,
  };
}

/**
 * List the user's recent Google Drive folders (for quick 1-click folder selection)
 */
export async function listRecentDriveFolders(
  accessToken: string,
  searchQuery: string = ""
): Promise<DriveFolderInfo[]> {
  let q = "mimeType = 'application/vnd.google-apps.folder' and trashed = false";
  if (searchQuery.trim()) {
    const escaped = searchQuery.trim().replace(/['\\]/g, "");
    q += ` and name contains '${escaped}'`;
  }

  const params = new URLSearchParams({
    q,
    fields: "files(id,name,mimeType,webViewLink,modifiedTime)",
    orderBy: "modifiedTime desc",
    pageSize: "30",
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true",
  });

  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Failed to list Drive folders (${response.status}): ${errText}`);
  }

  const result = await response.json();
  return (result.files || []).map((f: any) => ({
    id: f.id,
    name: f.name || "Untitled Folder",
    mimeType: f.mimeType,
    webViewLink: f.webViewLink,
    modifiedTime: f.modifiedTime,
  }));
}

/**
 * List all non-trashed files directly inside a given folder ID
 */
export async function listFilesInDriveFolder(
  folderId: string,
  accessToken: string
): Promise<DriveFileItem[]> {
  const q = `'${folderId}' in parents and trashed = false`;
  const params = new URLSearchParams({
    q,
    fields: "files(id,name,mimeType,size,modifiedTime,webViewLink,iconLink)",
    orderBy: "name",
    pageSize: "100",
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true",
  });

  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Failed to list files in folder (${response.status}): ${errText}`);
  }

  const result = await response.json();
  return (result.files || []).map((f: any) => ({
    id: f.id,
    name: f.name,
    mimeType: f.mimeType,
    size: f.size ? Number(f.size) : undefined,
    modifiedTime: f.modifiedTime,
    webViewLink: f.webViewLink,
    iconLink: f.iconLink,
  }));
}

/**
 * Fetch and parse a file's content from Google Drive into an UploadedDocument
 */
export async function fetchDriveFileContent(
  file: DriveFileItem,
  accessToken: string
): Promise<UploadedDocument> {
  const isGoogleDoc = file.mimeType === "application/vnd.google-apps.document";
  const isGoogleSheet = file.mimeType === "application/vnd.google-apps.spreadsheet";
  const isGoogleSlide = file.mimeType === "application/vnd.google-apps.presentation";
  const isFolder = file.mimeType === "application/vnd.google-apps.folder";

  if (isFolder) {
    return {
      id: `drive-${file.id}`,
      name: file.name,
      mimeType: file.mimeType,
      size: 0,
      excerpt: "[Subfolder]",
    };
  }

  // 1. Google Docs -> Export as plain text
  if (isGoogleDoc) {
    const exportUrl = `https://www.googleapis.com/drive/v3/files/${file.id}/export?mimeType=text/plain`;
    const res = await fetch(exportUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      throw new Error(`Failed to export Google Doc ${file.name}`);
    }
    const text = await res.text();
    const cleanExcerpt =
      text.replace(/\s+/g, " ").trim().slice(0, 140) +
      (text.length > 140 ? "..." : "");

    return {
      id: `drive-${file.id}`,
      name: `${file.name}.txt`,
      mimeType: "text/plain",
      size: new Blob([text]).size,
      textContent: text,
      excerpt: cleanExcerpt || "Google Document",
    };
  }

  // 2. Google Sheets -> Export as CSV
  if (isGoogleSheet) {
    const exportUrl = `https://www.googleapis.com/drive/v3/files/${file.id}/export?mimeType=text/csv`;
    const res = await fetch(exportUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      throw new Error(`Failed to export Google Sheet ${file.name}`);
    }
    const csv = await res.text();
    return {
      id: `drive-${file.id}`,
      name: `${file.name}.csv`,
      mimeType: "text/csv",
      size: new Blob([csv]).size,
      textContent: csv,
      excerpt: csv.slice(0, 140) + (csv.length > 140 ? "..." : ""),
    };
  }

  // 3. Google Slides -> Export as text/plain
  if (isGoogleSlide) {
    const exportUrl = `https://www.googleapis.com/drive/v3/files/${file.id}/export?mimeType=text/plain`;
    const res = await fetch(exportUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      throw new Error(`Failed to export Google Slide presentation ${file.name}`);
    }
    const text = await res.text();
    return {
      id: `drive-${file.id}`,
      name: `${file.name}.txt`,
      mimeType: "text/plain",
      size: new Blob([text]).size,
      textContent: text,
      excerpt: text.slice(0, 140) + (text.length > 140 ? "..." : ""),
    };
  }

  // 4. Standard text/code/markdown/json files
  const isTextLike =
    file.mimeType.startsWith("text/") ||
    file.mimeType === "application/json" ||
    /\.(md|txt|csv|json|xml|html|tsv|log)$/i.test(file.name);

  if (isTextLike) {
    const downloadUrl = `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`;
    const res = await fetch(downloadUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      throw new Error(`Failed to download text file ${file.name}`);
    }
    const text = await res.text();
    return {
      id: `drive-${file.id}`,
      name: file.name,
      mimeType: file.mimeType || "text/plain",
      size: file.size || new Blob([text]).size,
      textContent: text,
      excerpt:
        text.replace(/\s+/g, " ").trim().slice(0, 140) +
        (text.length > 140 ? "..." : ""),
    };
  }

  // 5. Binary files (PDFs, Images, Word docs)
  const downloadUrl = `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`;
  const res = await fetch(downloadUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Failed to download file ${file.name}`);
  }
  const blob = await res.blob();
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const b64 = result.includes(",") ? result.split(",")[1] : result;
      resolve(b64);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

  return {
    id: `drive-${file.id}`,
    name: file.name,
    mimeType: file.mimeType || "application/octet-stream",
    size: file.size || blob.size,
    base64Data: base64,
    excerpt: `Attached Drive File (${file.mimeType})`,
  };
}

/**
 * Sync all files from a Google Drive folder and convert them to UploadedDocuments
 */
export async function syncDriveFolderFiles(
  folderId: string,
  accessToken: string,
  onProgress?: (current: number, total: number, fileName: string) => void
): Promise<{
  folderInfo: DriveFolderInfo;
  files: DriveFileItem[];
  documents: UploadedDocument[];
}> {
  // 1. Get Folder Info
  const folderInfo = await getDriveFolderDetails(folderId, accessToken);

  // 2. List Files
  const allFiles = await listFilesInDriveFolder(folderId, accessToken);
  // Filter out sub-folders or empty files if appropriate
  const processableFiles = allFiles.filter(
    (f) => f.mimeType !== "application/vnd.google-apps.folder"
  );

  const documents: UploadedDocument[] = [];

  for (let i = 0; i < processableFiles.length; i++) {
    const file = processableFiles[i];
    if (onProgress) {
      onProgress(i + 1, processableFiles.length, file.name);
    }
    try {
      const doc = await fetchDriveFileContent(file, accessToken);
      documents.push(doc);
    } catch (err) {
      console.warn(`Could not fetch file content for ${file.name}:`, err);
      // Still include file placeholder so user sees it
      documents.push({
        id: `drive-${file.id}`,
        name: file.name,
        mimeType: file.mimeType,
        size: file.size || 0,
        excerpt: `[Drive File: ${file.name}]`,
      });
    }
  }

  return {
    folderInfo,
    files: allFiles,
    documents,
  };
}
