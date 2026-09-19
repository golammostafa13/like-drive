/**
 * Facts about this drive, as opposed to interface strings.
 *
 * The dictionaries hold sentences that get translated; these are names, and
 * the metadata and sitemap builders need them without a locale in hand.
 */
export const site = {
  name: "Drive",
  nameBn: "ড্রাইভ",
  tagline: "A quiet shelf for documents",
  taglineBn: "নথির জন্য একটি শান্ত তাক",
  /**
   * What a search engine sees. The only page it can reach is the sign-in
   * form, so this describes what the password opens rather than what is
   * inside — there is nothing inside that should be indexed.
   */
  description:
    "A private document library. Sign in to read and download the files it holds.",
  descriptionBn:
    "একটি ব্যক্তিগত নথি লাইব্রেরি। এর ফাইলগুলি পড়তে ও ডাউনলোড করতে সাইন ইন করুন।",
} as const;
