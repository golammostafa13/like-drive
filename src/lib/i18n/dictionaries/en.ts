/**
 * English, and the shape of every other language.
 *
 * `Dictionary` in `lib/i18n` is `typeof en`, so every key added here becomes a
 * key Bengali must also carry or `tsc` fails. That is the point: a missing
 * translation should break the build, not ship an English sentence into a
 * Bengali page.
 *
 * Nothing in here is a function. Templates use `{placeholders}` filled by
 * `lib/i18n/format`, because a function cannot cross the Server/Client
 * Component boundary and a dictionary holding one could never be passed as a
 * prop.
 */
export const en = {
  common: {
    appName: "Drive",
    tagline: "A quiet shelf for documents.",
    loading: "Loading…",
    cancel: "Cancel",
    save: "Save",
    close: "Close",
    retry: "Try again",
    download: "Download",
    open: "Open",
    somethingWentWrong: "Something went wrong.",
    filesOne: "{n} file",
    filesMany: "{n} files",
    foldersOne: "{n} folder",
    foldersMany: "{n} folders",
    resultsOne: "{n} result",
    resultsMany: "{n} results",
    pagesOne: "{n} page",
    pagesMany: "{n} pages",
    downloadFormat: "Download {format}",
  },

  nav: {
    drive: "Drive",
    signOut: "Sign out",
    signedInAs: "Signed in as {name}",
    admin: "Admin",
    toggleTheme: "Switch theme",
    switchLanguage: "বাংলা",
  },

  auth: {
    title: "Sign in",
    emailLabel: "Email address",
    emailPlaceholder: "you@example.com",
    passwordLabel: "Password",
    submit: "Open the drive",
    submitting: "Opening…",
    badPassword: "That password is not right.",
    badEmail: "That does not look like an email address.",
    notAnAdmin:
      "That address is not on the administrators' list, so the administrator's password does nothing for it.",
    rateLimited:
      "Too many attempts. Try again in {seconds} seconds.",
    misconfigured:
      "Sign-in is not configured on this deployment. AUTH_SECRET is missing.",
    signedOut: "You are signed out.",
  },

  drive: {
    title: "Drive",
    empty: "Nothing here yet.",
    emptyAdmin: "Nothing here yet. Upload a PDF to begin.",
    emptyFolder: "This folder is empty.",
    root: "Drive",
    searchPlaceholder: "Search this folder",
    noResults: "Nothing here matches “{q}”.",
    sortBy: "Sort by",
    sortName: "Name",
    sortNewest: "Newest first",
    sortOldest: "Oldest first",
    sortLargest: "Largest first",
    viewGrid: "Grid",
    viewList: "List",
    viewShelf: "Shelf",
    newFolder: "New folder",
    newFolderName: "Folder name",
    upload: "Upload",
    uploadHint: "PDF only, up to {size}.",
    rename: "Rename",
    renameTo: "New name",
    delete: "Delete",
    deleteFileConfirm: "Delete “{name}”? This cannot be undone.",
    deleteFolderConfirm:
      "Delete “{name}” and everything inside it? This cannot be undone.",
    uploadedBy: "Added by {name}",
    waking:
      "The library is waking up. Give it a minute and try again.",
  },

  upload: {
    title: "Upload a PDF",
    drop: "Drop a PDF here, or choose one",
    choose: "Choose a file",
    notPdf: "That is not a PDF.",
    tooLarge: "That file is {size} — the limit is {limit}.",
    preparing: "Preparing…",
    sending: "Sending… {percent}%",
    thumbnailing: "Reading the first page…",
    finishing: "Finishing…",
    done: "Done.",
    failed: "The upload did not finish. Nothing was saved.",
    nameTaken: "A file with that name is already in this folder.",
  },

  reader: {
    backToBook: "Back to the drive",
    previousPage: "Previous page",
    nextPage: "Next page",
    pageOf: "Page {page} of {total}",
    jumpToPage: "Jump to page",
    pageLabel: "Page {page}",
    zoomIn: "Zoom in",
    zoomOut: "Zoom out",
    fitWidth: "Fit to width",
    sepia: "Sepia",
    loading: "Opening…",
    failed: "This file could not be opened.",
    downloadInstead: "Download it instead",
    metaTitle: "Read {title}",
  },

  qr: {
    title: "QR code",
    action: "QR code",
    hint: "Scan this to open the document on another device.",
    alt: "QR code that opens {title}",
    download: "Download PNG",
  },

  notFound: {
    code: "404",
    title: "There is nothing at this address.",
    body: "The file may have been renamed or deleted.",
    back: "Back to the drive",
  },

  footer: {
    builtWith: "A private drive.",
  },
};
