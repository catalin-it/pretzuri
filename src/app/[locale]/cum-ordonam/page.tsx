import type { Metadata } from "next";
import { TextPage, textPageMetadata } from "@/components/content/text-page";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return textPageMetadata((await params).locale, "RankingPage", "/cum-ordonam");
}

export default async function Page({ params }: Props) {
  return <TextPage locale={(await params).locale} ns="RankingPage" />;
}
