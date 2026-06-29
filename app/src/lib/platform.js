// iPadOS 13+ reports itself as "Macintosh" in both userAgent and platform,
// indistinguishable from a real Mac except that real Macs aren't
// touch-capable. Chrome on iOS (CriOS) is WebKit under the hood too, so
// matching the userAgent string alone covers it without checking for
// "Safari" specifically.
export function isIOS() {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}
