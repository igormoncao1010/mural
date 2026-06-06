import "./globals.css";

export const metadata = {
  title: "Mural Digital",
  description: "Mural participativo para fotos das ruas, debates e pre-campanha.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
