import type { Dictionary } from "@/lib/i18n";

/**
 * Bengali.
 *
 * Typed as `Dictionary`, which is `typeof en`, so a key added to English and
 * forgotten here is a compile error rather than an English sentence leaking
 * into a Bengali page.
 *
 * Numbers inside `{placeholders}` are converted to Bengali digits by
 * `lib/i18n/format` on the way in — "৪০টি ফাইল", never "40টি ফাইল".
 */
export const bn: Dictionary = {
  common: {
    appName: "ড্রাইভ",
    tagline: "নথির জন্য একটি শান্ত তাক।",
    loading: "লোড হচ্ছে…",
    cancel: "বাতিল",
    save: "সংরক্ষণ",
    close: "বন্ধ",
    retry: "আবার চেষ্টা করুন",
    download: "ডাউনলোড",
    open: "খুলুন",
    somethingWentWrong: "কিছু একটা ভুল হয়েছে।",
    filesOne: "{n}টি ফাইল",
    filesMany: "{n}টি ফাইল",
    foldersOne: "{n}টি ফোল্ডার",
    foldersMany: "{n}টি ফোল্ডার",
    resultsOne: "{n}টি ফলাফল",
    resultsMany: "{n}টি ফলাফল",
    pagesOne: "{n} পৃষ্ঠা",
    pagesMany: "{n} পৃষ্ঠা",
    downloadFormat: "{format} ডাউনলোড করুন",
  },

  nav: {
    drive: "ড্রাইভ",
    signOut: "সাইন আউট",
    signedInAs: "{name} হিসেবে সাইন ইন করা",
    admin: "প্রশাসন",
    toggleTheme: "থিম বদলান",
    switchLanguage: "English",
  },

  auth: {
    title: "সাইন ইন",
    emailLabel: "ইমেইল ঠিকানা",
    emailPlaceholder: "you@example.com",
    passwordLabel: "পাসওয়ার্ড",
    submit: "ড্রাইভ খুলুন",
    submitting: "খোলা হচ্ছে…",
    badPassword: "পাসওয়ার্ডটি ঠিক নয়।",
    badEmail: "এটি ইমেইল ঠিকানার মতো মনে হচ্ছে না।",
    notAnAdmin:
      "এই ঠিকানাটি প্রশাসকের তালিকায় নেই, তাই প্রশাসকের পাসওয়ার্ড এর জন্য কিছুই করে না।",
    rateLimited: "অনেকবার চেষ্টা হয়েছে। {seconds} সেকেন্ড পরে আবার চেষ্টা করুন।",
    misconfigured:
      "এই ডিপ্লয়মেন্টে সাইন-ইন কনফিগার করা নেই। AUTH_SECRET অনুপস্থিত।",
    signedOut: "আপনি সাইন আউট করেছেন।",
  },

  drive: {
    title: "ড্রাইভ",
    empty: "এখানে এখনও কিছু নেই।",
    emptyAdmin: "এখানে এখনও কিছু নেই। শুরু করতে একটি পিডিএফ আপলোড করুন।",
    emptyFolder: "এই ফোল্ডারটি খালি।",
    root: "ড্রাইভ",
    searchPlaceholder: "এই ফোল্ডারে খুঁজুন",
    noResults: "“{q}” এর সঙ্গে এখানে কিছু মেলেনি।",
    sortBy: "সাজান",
    sortName: "নাম",
    sortNewest: "নতুন আগে",
    sortOldest: "পুরোনো আগে",
    sortLargest: "বড় আগে",
    viewGrid: "গ্রিড",
    viewList: "তালিকা",
    viewShelf: "তাক",
    newFolder: "নতুন ফোল্ডার",
    newFolderName: "ফোল্ডারের নাম",
    upload: "আপলোড",
    uploadHint: "শুধু পিডিএফ, সর্বোচ্চ {size}।",
    rename: "নাম বদলান",
    renameTo: "নতুন নাম",
    delete: "মুছুন",
    deleteFileConfirm: "“{name}” মুছে ফেলবেন? এটি ফেরানো যাবে না।",
    deleteFolderConfirm:
      "“{name}” এবং এর ভিতরের সবকিছু মুছে ফেলবেন? এটি ফেরানো যাবে না।",
    uploadedBy: "{name} যোগ করেছেন",
    waking: "লাইব্রেরিটি জেগে উঠছে। এক মিনিট পরে আবার চেষ্টা করুন।",
  },

  upload: {
    title: "একটি পিডিএফ আপলোড করুন",
    drop: "এখানে একটি পিডিএফ ছাড়ুন, অথবা বেছে নিন",
    choose: "ফাইল বাছুন",
    notPdf: "এটি পিডিএফ নয়।",
    tooLarge: "ফাইলটি {size} — সীমা {limit}।",
    preparing: "প্রস্তুত করা হচ্ছে…",
    sending: "পাঠানো হচ্ছে… {percent}%",
    thumbnailing: "প্রথম পৃষ্ঠা পড়া হচ্ছে…",
    finishing: "শেষ করা হচ্ছে…",
    done: "সম্পন্ন।",
    failed: "আপলোড শেষ হয়নি। কিছুই সংরক্ষিত হয়নি।",
    nameTaken: "এই নামের একটি ফাইল ইতিমধ্যে এই ফোল্ডারে আছে।",
  },

  reader: {
    backToBook: "ড্রাইভে ফিরুন",
    previousPage: "আগের পৃষ্ঠা",
    nextPage: "পরের পৃষ্ঠা",
    pageOf: "{total}-এর {page} নং পৃষ্ঠা",
    jumpToPage: "নির্দিষ্ট পৃষ্ঠায় যান",
    pageLabel: "{page} নং পৃষ্ঠা",
    zoomIn: "বড় করুন",
    zoomOut: "ছোট করুন",
    fitWidth: "পর্দার প্রস্থে মেলান",
    sepia: "সেপিয়া",
    loading: "খোলা হচ্ছে…",
    failed: "এই ফাইলটি খোলা যায়নি।",
    downloadInstead: "বরং ডাউনলোড করুন",
    metaTitle: "{title} পড়ুন",
  },

  qr: {
    title: "কিউআর কোড",
    action: "কিউআর কোড",
    hint: "অন্য ডিভাইসে নথিটি খুলতে এটি স্ক্যান করুন।",
    alt: "{title} খোলার কিউআর কোড",
    download: "পিএনজি ডাউনলোড",
  },

  notFound: {
    code: "৪০৪",
    title: "এই ঠিকানায় কিছু নেই।",
    body: "ফাইলটির নাম বদলানো হয়ে থাকতে পারে, অথবা সেটি মুছে ফেলা হয়েছে।",
    back: "ড্রাইভে ফিরুন",
  },

  footer: {
    builtWith: "একটি ব্যক্তিগত ড্রাইভ।",
  },
};
