import { ImageResponse } from "next/og";

export const size = { width: 64, height: 64 };
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
          background: "#0A0A0A",
          borderRadius: 14,
          color: "#FAFAFA",
          fontSize: 36,
          fontWeight: 700,
          letterSpacing: -1,
        }}
      >
        C
      </div>
    ),
    { ...size },
  );
}
