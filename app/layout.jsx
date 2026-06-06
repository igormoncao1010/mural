import "./globals.css";

export const metadata = {
  title: "Nodus | Fluxo da Informação",
  description: "Nodus conecta pessoas, ideias, relatos e debates locais.",
  icons: {
    icon: "/icon.svg",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
