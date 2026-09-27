// The gallery's thumbnails (the `gallery` component in
// templates/components.html).
//
// Without this module a gallery already works: its track is a strip that
// scrolls sideways and snaps to one figure at a time, and each thumbnail is a
// link to its figure's anchor. What this adds: a thumbnail scrolls the strip
// in place instead of jumping the page to the anchor, and the thumbnail of
// whichever figure is in view - reached by a thumbnail, a swipe or the keys -
// is marked current.
//
// Loaded by each gallery's own script tag; a module runs once however many
// tags name it, and after the page has parsed, so every gallery is here.

const still = matchMedia("(prefers-reduced-motion: reduce)");

for (const gallery of document.querySelectorAll("[data-gallery]")) {
  const track = gallery.querySelector("[data-gallery-track]");
  const thumbs = [...gallery.querySelectorAll("[data-gallery-thumb]")];

  // Every slide is the track's full width, so the slide in view is the
  // scroll position in widths.
  const current = () => Math.round(track.scrollLeft / Math.max(track.clientWidth, 1));

  const mark = () => {
    const at = current();
    for (const [i, thumb] of thumbs.entries()) {
      const here = i === at;
      thumb.classList.toggle("Gallery__Thumb--current", here);
      if (here) thumb.setAttribute("aria-current", "true");
      else thumb.removeAttribute("aria-current");
    }
  };

  for (const [i, thumb] of thumbs.entries()) {
    thumb.addEventListener("click", (event) => {
      event.preventDefault();
      track.scrollTo({
        left: i * track.clientWidth,
        behavior: still.matches ? "auto" : "smooth",
      });
    });
  }

  // The mark follows the strip however it moved; once a frame at most.
  let pending = 0;
  track.addEventListener("scroll", () => {
    if (!pending) {
      pending = requestAnimationFrame(() => {
        pending = 0;
        mark();
      });
    }
  });
  mark();
}
