import { Directory, File, Paths } from "expo-file-system";

function mediaDir() {
  const dir = new Directory(Paths.document, "media");
  if (!dir.exists) dir.create();
  return dir;
}

// Copies a temp file into permanent storage and returns just its name
export function saveMedia(tempUri: string, ext: string): string {
  const name = `${Date.now()}.${ext}`;
  new File(tempUri).copy(new File(mediaDir(), name));
  return name;
}

// Saves raw image data (like a drawing) and returns its file name
export function saveBytes(bytes: Uint8Array, ext: string): string {
  const name = `${Date.now()}.${ext}`;
  const file = new File(mediaDir(), name);
  if (!file.exists) file.create();
  file.write(bytes);
  return name;
}

// Turns a saved name back into a full path when we need to show it
export function mediaUri(name: string): string {
  return new File(mediaDir(), name).uri;
}

export function mediaExists(name: string): boolean {
  return new File(mediaDir(), name).exists;
}

export function readMedia(name: string): Uint8Array {
  return new File(mediaDir(), name).bytesSync();
}

// Downloads a file from a web address into the media folder
export async function downloadMedia(url: string, name: string) {
  const dest = new File(mediaDir(), name);
  if (dest.exists) return;
  await File.downloadFileAsync(url, dest);
}

// Permanently removes a saved photo, drawing or voice note
export function deleteMedia(name: string) {
  const file = new File(mediaDir(), name);
  if (file.exists) file.delete();
}

// Removes every saved file on this phone
export function clearMediaFolder() {
  const dir = new Directory(Paths.document, "media");
  if (dir.exists) dir.delete();
}