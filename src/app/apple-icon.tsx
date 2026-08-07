import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #f43f5e 0%, #e11d48 100%)",
          borderRadius: 36,
        }}
      >
        <svg width="110" height="110" viewBox="0 0 32 32" fill="none">
          <path
            d="M16 4c2 5 8 7 8 14a8 8 0 1 1-16 0c0-4 3-7 5-9 1 3 3 4 5 4-1-3-2-6-2-9z"
            fill="white"
          />
        </svg>
      </div>
    ),
    { ...size },
  );
}
