"use client";
import { useState } from "react";
import Markdown from "react-markdown";
import { safeUrl } from "@/lib/files.mjs";
import { safeNoteImageUrl } from "@/lib/note-images.mjs";

function NoteImage({ src, alt }) {
  const [failed, setFailed] = useState(false);
  return <span className="note-image">{src && !failed ? <>
    {/* User-supplied and local draft images are rendered directly, without a server image proxy. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={src} alt={alt || "Supporting image"} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)}/>
    {alt && <span className="note-image-caption">{alt}</span>}
  </> : <span className="note-image-unavailable">Image unavailable{alt ? `: ${alt}` : ""}</span>}</span>;
}

export default function NoteContent({ text, draftImages = {} }) {
  function imageSource(url) {
    const draft = Object.hasOwn(draftImages, url) ? draftImages[url] : null;
    return typeof draft === "string" && draft.startsWith("blob:") ? draft : safeNoteImageUrl(url) || "";
  }
  return <div className="note-content"><Markdown skipHtml allowedElements={["p", "h1", "h2", "h3", "h4", "h5", "h6", "strong", "em", "ul", "ol", "li", "blockquote", "pre", "code", "hr", "br", "a", "img"]} urlTransform={(url, key) => key === "src" ? imageSource(url) : safeUrl(url) || ""} components={{ a: ({ href, children }) => href ? <a href={href} target="_blank" rel="noopener noreferrer">{children}</a> : <span>{children}</span>, img: ({ src, alt }) => <NoteImage key={src || alt} src={src} alt={alt}/> }}>{text}</Markdown></div>;
}
