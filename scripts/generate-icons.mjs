// Generates the PWA icons in public/icons from an inline SVG (run: npm run icons). Output is committed.
import sharp from "sharp";
import { mkdirSync } from "node:fs";

const svg = (pad) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${pad ? 0 : 96}" fill="#0b6e4f"/>
  <g transform="translate(${pad ? 76 : 56} ${pad ? 76 : 56}) scale(${pad ? 0.703 : 0.781})">
    <path d="M60 60h190l200 200-190 190L60 250z" fill="none" stroke="#fff" stroke-width="40" stroke-linejoin="round"/>
    <circle cx="150" cy="150" r="34" fill="#fff"/>
    <path d="M200 330l130-130" stroke="#fff" stroke-width="36" stroke-linecap="round"/>
  </g>
</svg>`;

mkdirSync("public/icons", { recursive: true });
await sharp(Buffer.from(svg(false))).resize(192, 192).png().toFile("public/icons/icon-192.png");
await sharp(Buffer.from(svg(false))).resize(512, 512).png().toFile("public/icons/icon-512.png");
await sharp(Buffer.from(svg(true))).resize(512, 512).png().toFile("public/icons/icon-maskable-512.png");
console.log("icons written to public/icons");
