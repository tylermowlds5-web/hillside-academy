// Plain reference player: YouTube / Vimeo embed or a native <video> with the
// browser's own controls. Deliberately NOT the tracked VideoPlayer — no
// anti-skip, no progress writes. Reading the library never counts as watching.

function getYouTubeId(url: string): string | null {
  const patterns = [/youtube\.com\/watch\?v=([^&]+)/, /youtube\.com\/embed\/([^?]+)/, /youtu\.be\/([^?]+)/]
  for (const p of patterns) {
    const m = url.match(p)
    if (m) return m[1]
  }
  return null
}

function getVimeoId(url: string): string | null {
  const m = url.match(/vimeo\.com\/(\d+)/)
  return m ? m[1] : null
}

export default function LibraryVideoPlayer({ url, title }: { url: string; title: string }) {
  const yt = url.includes('youtube.com') || url.includes('youtu.be') ? getYouTubeId(url) : null
  if (yt) {
    return (
      <iframe
        src={`https://www.youtube.com/embed/${yt}?rel=0`}
        title={title}
        className="aspect-video w-full"
        allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        allowFullScreen
      />
    )
  }

  const vimeo = url.includes('vimeo.com') ? getVimeoId(url) : null
  if (vimeo) {
    return (
      <iframe
        src={`https://player.vimeo.com/video/${vimeo}?autoplay=0`}
        title={title}
        className="aspect-video w-full"
        allow="autoplay; fullscreen; picture-in-picture"
        allowFullScreen
      />
    )
  }

  return (
    <video src={url} controls playsInline preload="metadata" className="aspect-video w-full bg-black" />
  )
}
