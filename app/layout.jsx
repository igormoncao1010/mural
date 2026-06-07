import "./globals.css";

export const metadata = {
  title: "Nodus | Fluxo da Informação",
  description: "Nodus conecta pessoas, ideias, relatos e debates locais.",
  applicationName: "Nodus",
  manifest: "/manifest.json",
  themeColor: "#111111",
  appleWebApp: {
    capable: true,
    title: "Nodus",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg",
  },
};

export const viewport = {
  themeColor: "#111111",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
