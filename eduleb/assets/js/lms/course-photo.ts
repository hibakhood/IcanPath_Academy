/** Illustrative accounting photography; a tutor's supplied cover takes priority. */
export function coursePhoto(title: string, thumbnail?: string | null): string {
  if (thumbnail && (/^https:\/\//.test(thumbnail) || /^\/assets\/img\//.test(thumbnail))) return thumbnail;
  const key = title.toLowerCase();
  const index = /tax|accounting/.test(key) ? 1 : /report|analysis/.test(key) ? 2 : /business|management|law/.test(key) ? 3 : /audit|assurance/.test(key) ? 4 : /finance|performance/.test(key) ? 5 : 6;
  return `/assets/img/course/${index}.jpg`;
}
