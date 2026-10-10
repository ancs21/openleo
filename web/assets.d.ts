// Bun's bundler turns imported asset files into their served URL.
declare module "*.svg" {
  const url: string;
  export default url;
}
declare module "*.mp4" {
  const url: string;
  export default url;
}
declare module "*.jpg" {
  const url: string;
  export default url;
}
// The landing page build imports assets with `?url`.
declare module "*?url" {
  const url: string;
  export default url;
}
