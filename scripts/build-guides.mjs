// Builds the SEO guide pages (one per search query) as plain HTML at the project root.
// Run: node scripts/build-guides.mjs  (then vite build picks them up as extra pages).
// Facts only: every claim here must be true of the live tool. Update UPDATED when a page really changes.
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const SITE = "https://kahanio.clientorahq.com";
const UPDATED = "2026-11-17";
const UPDATED_TEXT = "17 November 2026";

export const GUIDES = [
  {
    slug: "urdu-reel-maker",
    query: "urdu reel maker",
    title: "Urdu Reel Maker: Free, With Urdu AI Voice | Kahanio",
    description: "Make Urdu reels free: write in Urdu or Hindi letters, pick an Urdu AI voice, get a 9:16 MP4 with Nastaliq captions, music and footage. No sign-up.",
    h1: "Free Urdu reel maker with an Urdu AI voice",
    question: "How do I make an Urdu reel for free?",
    answer:
      "Open Kahanio, write your script in Urdu, or in Hindi letters if that is easier, and choose an Urdu AI voice such as Uzma or Asad. Pick a template and press Make my video. You get a 9:16 MP4 with Urdu captions in Nastaliq, music and real footage, made in your browser with no sign-up.",
    preset: "?lang=ur&template=clean",
    sections: [
      {
        h2: "Step by step",
        list: [
          "Type your topic, then write the script in the script box: one scene per line.",
          "In step 3 choose AI voice, then Urdu, then Uzma (female) or Asad (male). Press Listen to hear the first line.",
          "Pick a template. Clean and Cartoon read well with Urdu text.",
          "Leave Real video footage on for stock clips behind each scene, or add your own photos.",
          "Press Make my video, then download the MP4 and the captions file.",
        ],
      },
      {
        h2: "Can I write in Hindi letters and still get an Urdu voice?",
        p: "Yes. Choose Hindi script, Urdu voice in step 3. Your captions stay in Hindi letters as you wrote them, and Kahanio turns each line into Urdu letters before the Urdu voice speaks it. Spoken Hindi and Urdu are close, so the voice sounds Urdu. Roman Urdu (Urdu in English letters) is not read well by the Urdu voices, so use Urdu or Hindi letters.",
      },
      {
        h2: "Common mistakes",
        list: [
          "Long sentences: keep each scene to one or two short sentences so the captions stay readable.",
          "Writing in Roman Urdu for the AI voice: use Urdu or Hindi letters instead.",
          "Posting the same template video again and again: add your own voice or opinion so the video is clearly yours.",
        ],
      },
    ],
    faq: [
      ["Is the Urdu reel maker really free?", "Yes. Kahanio is free with no sign-up and no watermark over your video. A short end card at the end credits the footage and the tool."],
      ["Which Urdu AI voices are there?", "Two Urdu voices with a Pakistani accent: Uzma (female) and Asad (male). You can also record or upload your own voice."],
      ["Are the captions in Urdu script?", "Yes. Urdu text is drawn in the Noto Nastaliq Urdu font, right to left, scene by scene."],
      ["Can I make a 16:9 video for YouTube too?", "Yes. Choose 16:9 widescreen in step 2. 9:16 is for reels, Shorts and TikTok."],
    ],
  },
  {
    slug: "topic-to-video",
    query: "topic to video",
    title: "Topic to Video: Turn Any Topic Into a Short Video | Kahanio",
    description: "Turn a topic into a short video free: get a script, word-by-word captions, AI voice, music and real footage as a 9:16 or 16:9 MP4. In your browser.",
    h1: "Topic to video: turn any topic into a short video",
    question: "How do I turn a topic into a video?",
    answer:
      "Type the topic in Kahanio. Write the script yourself, use the quick starter, or let a free AI write it with your own free key. Choose a template, a voice and the format, then press Make my video. Kahanio adds captions, music and stock footage and gives you an MP4, made in your browser.",
    preset: "",
    sections: [
      {
        h2: "Three ways to get the script",
        list: [
          "Write it yourself: one scene per line. Your own words make the most original videos.",
          "Quick starter: a five-scene draft from your topic, with no AI, for you to edit.",
          "Free AI: Groq, Google Gemini or OpenRouter's free models, with your own free API key. The key stays in your browser tab.",
        ],
      },
      {
        h2: "An example",
        p: "Topic: cold email tips. Script: \"Most cold emails get no reply. Here is why.\" / \"Start with the client's problem, not your service.\" / \"Keep it under five sentences.\" / \"End with one easy question.\" With the Story template, an AI voice and real footage on, Kahanio makes a vertical video of about 20 seconds with each word highlighted as it is spoken.",
      },
      {
        h2: "Common mistakes",
        list: [
          "Too many scenes: four to six short scenes keep a reel under 45 seconds.",
          "No search words: add words in [brackets] at the end of a line, like [laptop, office], to get better footage.",
          "Not checking an AI script: always read and fix it before you post.",
        ],
      },
    ],
    faq: [
      ["Do I need an account?", "No. Kahanio works without sign-up. Videos are made in your browser and are not uploaded to us."],
      ["How long can the video be?", "It follows your script. About 20 to 45 seconds suits reels and Shorts."],
      ["Where does the footage come from?", "From Pexels' free stock library. Each video credits the filmmakers on its end card, and you get credit text for your description."],
      ["Can I add my own photos?", "Yes. Add photos in step 2 and they move with slow, smooth 3D camera motion."],
    ],
  },
  {
    slug: "ai-short-video-generator",
    query: "ai short video generator free",
    title: "Free AI Short Video Generator, No Sign-Up | Kahanio",
    description: "A free AI short video generator: 7 templates, AI voice in English, Urdu or Hindi, captions, music and real footage. No sign-up, made in your browser.",
    h1: "Free AI short video generator, no sign-up",
    question: "What is a free AI short video generator?",
    answer:
      "It is a tool that turns your words into a short vertical video with captions, a voice and visuals. Kahanio does this free with no sign-up: seven templates, an AI voice in English, Urdu or Hindi, word-by-word captions, music made for each video and real stock footage, exported as an MP4 from your browser.",
    preset: "",
    sections: [
      {
        h2: "What you can make",
        list: [
          "Reels, Shorts and TikToks in 9:16, or 16:9 videos for YouTube.",
          "Seven templates: Story, Bold Pop, Clean, Neon Night, Chat, Cartoon and Headline.",
          "A cartoon presenter that speaks your script with lip-sync.",
          "Your own photos with slow 3D camera motion.",
        ],
      },
      {
        h2: "Will a generated video hurt my YouTube channel?",
        p: "YouTube's monetisation rules leave out inauthentic content: mass-produced, repetitive videos with no personal touch. Use the tool to save time, then add your own voice, opinion or footage, and turn on YouTube's altered or synthetic content setting when a video could look real.",
      },
      {
        h2: "Common mistakes",
        list: [
          "Removing the footage credits: keep them in your video description.",
          "Using the same script for many videos: change the words and the angle each time.",
          "Skipping the AI-assisted label when the platform asks for it.",
        ],
      },
    ],
    faq: [
      ["Is there a watermark?", "No watermark is placed over your video. A short end card credits the footage and Kahanio."],
      ["Which voices are free?", "English voices on your device and online, plus Urdu (Uzma, Asad) and Hindi (Swara, Madhur) online voices. You can also use your own recording."],
      ["Does it work on a phone?", "The page works on phones, but making the video is fastest on a computer with a recent Chrome or Edge."],
      ["Who makes Kahanio?", "Kahanio is a free tool from ClientoraHQ, which finds clients for freelancers and agencies."],
    ],
  },
];

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function page(g) {
  const url = `${SITE}/${g.slug}`;
  const ld = [
    { "@context": "https://schema.org", "@type": "WebPage", name: g.title, url, description: g.description, dateModified: UPDATED, isPartOf: { "@type": "WebSite", name: "Kahanio", url: `${SITE}/` }, publisher: { "@type": "Organization", name: "ClientoraHQ", url: "https://clientorahq.com" } },
    { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: g.faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) },
    { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Kahanio", item: `${SITE}/` }, { "@type": "ListItem", position: 2, name: g.h1, item: url }] },
  ];
  const others = GUIDES.filter((o) => o.slug !== g.slug).map((o) => `<a href="/${o.slug}">${esc(o.h1)}</a>`).join(" · ");
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esc(g.title)}</title>
    <meta name="description" content="${esc(g.description)}" />
    <link rel="canonical" href="${url}" />
    <meta property="og:type" content="article" />
    <meta property="og:title" content="${esc(g.title)}" />
    <meta property="og:description" content="${esc(g.description)}" />
    <meta property="og:url" content="${url}" />
    <meta property="og:image" content="${SITE}/og-image.png" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="theme-color" content="#FF4D6D" />
    <link rel="icon" href="/logo-mark.svg" type="image/svg+xml" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@500;600;800&display=swap" rel="stylesheet" />
    <link rel="stylesheet" href="/src/style.css" />
    <link rel="stylesheet" href="/src/guide.css" />
    ${ld.map((x) => `<script type="application/ld+json">${JSON.stringify(x)}</script>`).join("\n    ")}
  </head>
  <body>
    <div class="glow" aria-hidden="true"></div>
    <header class="top wrap">
      <a class="brand" href="/"><img src="/logo-mark.svg" alt="" width="38" height="38" /><span>kahanio</span></a>
      <a class="maker" href="https://clientorahq.com" target="_blank" rel="noopener">by <strong>ClientoraHQ</strong></a>
    </header>
    <main class="wrap guide">
      <nav class="crumbs" aria-label="Breadcrumb"><a href="/">Kahanio</a> <span aria-hidden="true">/</span> <span>${esc(g.h1)}</span></nav>
      <h1>${esc(g.h1)}</h1>
      <p class="updated">Updated <time datetime="${UPDATED}">${UPDATED_TEXT}</time></p>
      <section class="answer">
        <h2>${esc(g.question)}</h2>
        <p>${esc(g.answer)}</p>
        <a class="primary big-cta" href="/${g.preset}#make">Make a free video now</a>
      </section>
      ${g.sections
        .map((s) => `<section><h2>${esc(s.h2)}</h2>${s.list ? `<ol>${s.list.map((li) => `<li>${esc(li)}</li>`).join("")}</ol>` : `<p>${esc(s.p)}</p>`}</section>`)
        .join("\n      ")}
      <section class="faq">
        <h2>Questions</h2>
        ${g.faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("\n        ")}
      </section>
      <section class="cta-box">
        <h2>Try it free</h2>
        <p>No sign-up. Your video is made in your browser.</p>
        <a class="primary" href="/${g.preset}#make">Open Kahanio</a>
      </section>
      <p class="hint more">More guides: ${others}</p>
    </main>
    <footer class="foot wrap">
      <a class="brand footbrand" href="/"><img src="/logo-mark.svg" alt="" width="30" height="30" /><span>kahanio</span></a>
      <p>A free tool from the makers of <a href="https://clientorahq.com" target="_blank" rel="noopener">ClientoraHQ</a>, which finds clients for freelancers and agencies.</p>
    </footer>
  </body>
</html>
`;
}

const root = join(import.meta.dirname, "..");
for (const g of GUIDES) writeFileSync(join(root, `${g.slug}.html`), page(g));
console.log("wrote", GUIDES.map((g) => `${g.slug}.html`).join(", "));
