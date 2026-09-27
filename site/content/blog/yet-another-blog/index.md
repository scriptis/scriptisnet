---
title: Yet another blog
date: 2026-09-26
description: scriptis builds another blog
extra:
  galleries:
    blocks:
      label: Blocks
      items:
        - src: blocks_santa.png
          alt: Santa's Fortress
        - src: blocks_hq.png
          alt: Roblox HQ
        - src: blocks_destruction.png
          alt: Roblox HQ in shambles
    voxelium:
      label: Voxelium
      items:
        - src: voxelium_mountains.png
          alt: Voxelium - mountain range
        - src: voxelium_megastructure.png
          alt: Voxelium - megastructure interior
        - src: voxelium_megastructure_2.png
          alt: Voxelium - megastructure interior (2)
---

In the past eleven years, I have opened a blog here no less than three times, each time writing nothing--but now I have
a lot of stuff to write about, so maybe this time I'll actually show something off!

Anyway, a quick write-up on idle experiments I've been working on...

<!-- more -->

# Wacke

A UI library I've been making in my free time, and that I'd quite like to open-source someday!

{{ <figure src="wacke_chat_app.png" alt="A chat app made with wacke" /> }}

Wacke is a fine-grained reactive (as in Solid or Vue) tile-based retained-mode UI library that runs on Windows, Linux
(X11+Wayland), MacOS, Android, and iOS. It's already fairly feature-complete with platform seams for common UX patterns,
motion, animation, localization and accessibility--the works. It's zero-compromises; the above application runs with
30MiB of unified RAM!

I built this after I ended up building the Rest of the Owl for Flutter's multiwindow support that's been in alpha
forever--and it _sucked._ Flutter Engine is massive, compiles the whole of LLVM, and is extremely unfriendly to develop.
It's no wonder development is so slow on new features. I also managed to get Windows cross-compilation working, so
consider that another owl drawn--but it wasn't worth it. I hate MSVC! Give me GNU!

Anyway, here's how it flows:

```rust,linenos
/// The member list for whichever guild `guild` names.
pub(crate) fn members(directory: Arc<Directory>, guild: Signal<GuildId>) -> impl Describe {
    move |ui: Ui<'_>| -> View {
        let region = scrollable(ui, Axis::Vertical, Extent::Fill);
        let inside = region.viewport().inside(ui);
        let directory = directory.clone();
        let listed = switch(ui.computed(move |rt| guild.get(rt)))
            .axis(Axis::Vertical)
            .describe(move |ui: Ui<'_>, open: &GuildId| {
                let Some(open) = directory.guild(*open) else {
                    return Vec::new();
                };
                vec![groups(ui, open.members(), open.voice())]
            });

        let listed = sized_box()
            .padding((18.0, 12.0))
            .around(listed)
            .realize(Ui::new(ui.runtime, &inside));

        region.adopt(ui.runtime, listed);

        let body = flex()
            .axis(Axis::Horizontal)
            .across(Across::Stretch)
            .children((
                edge(|look| look.line),
                sized_box()
                    .flex(1.0, 0.0)
                    .around(scrolled(ui, region.view(), region.viewport())),
            ));

        sized_box()
            .width(Extent::Px(WIDTH.into()))
            .background(fill(ui, |look| look.members))
            .around(body)
            .realize(ui)
    }
}
```

Still nailing down the ergonomics on this one; but a few things from downstream art:

- `rsx!` or equivalent macros: no. I'd prefer to have _no_ magic.
- Thread local runtimes (Leptos & company): no. I'd prefer to have `Runtime` be `Send` (and this also qualifies as
  magic).
- Accessibility and localization should be first-class, not an afterthought!
- I want to render to plain HMTL and to WebGPU, depending on fallback (this already works; HTML is just another derived
  value).

Oh, also my measure of success for this has been "millijoules per frame rendered on my Pixel 7 Pro." (It's quite good.)

# Blocks

A 2008-era measured and cleanroomed Roblox clone, featuring modern graphics features and pipelines!

{{ <gallery name="blocks" /> }}

There's really not much to say here that the pictures don't speak to; it loads and simulates levels. I've been spending
a lot of time on the physics engine implementation here; I started with Box3D, translated it into Rust, then ended up
frustrated with it and started building my own from scratch (as I frequently do). The new physics engine is
plug-and-play--every stage can be hotswapped at compile time, such that I can experiment with AVBD, XPBD, and a number
of other lineages.

Oh, and I did measure all of the physical constants from the 2008 version of studio! Of course I did.

# Voxelium

A pushing-the-frontier voxel tracer with really good global illumination I've spent way too many months working on!

{{ <gallery name="voxelium" /> }}

What was supposed to be a one-day foray into implementing DDGI ended up turning into a monthslong abomination of a
Jacobian solver that ended with Zhao (2005)'s fast sweeping method and a few borrowed ideas from Radiance Cascades. I'm
still not satisfied with it--the megastructure scenes take upwards of 24GB of unified RAM (overworld/terrain scenes stay
well below 1GB). Lighting, as it turns out, does not compress. So I've solved the alleged hard part (computation) for my
scenes and now I'm dealing with the real hard part (memory). Pah!

# Klaxon

A [BeeKEM](https://sunoopark.com/p/26/beekem.pdf) (PDF)-adjacent Discord-style, guild-supporting, role-hierarchied,
end-to-end encrypted instant messaging platform!

-- not much to say here yet. I'll post about this later.
