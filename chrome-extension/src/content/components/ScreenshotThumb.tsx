interface ScreenshotThumbProps {
  base64: string;
}

export function ScreenshotThumb({ base64 }: ScreenshotThumbProps) {
  if (!base64) return null;

  return (
    <div className="cs-popup-thumb">
      <img src={`data:image/jpeg;base64,${base64}`} alt="Element screenshot" />
    </div>
  );
}
