import { ImageResponse } from "next/og";

/** Google Search requires ≥48×48 square favicon */
export const size = { width: 48, height: 48 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #f43f5e 0%, #be123c 100%)",
          borderRadius: 10,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "white",
            fontSize: 22,
            fontWeight: 800,
            letterSpacing: "-0.06em",
            fontFamily: "system-ui, -apple-system, sans-serif",
          }}
        >
          LF
        </div>
      </div>
    ),
    { ...size },
  );
}
