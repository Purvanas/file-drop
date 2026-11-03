i18n.init({ en: {
  // Header
  '.subtitle': 'Temporary file & text sharing',

  // Mode toggle
  '.mode-btn[data-mode="file"]': 'File',
  '.mode-btn[data-mode="paste"]': 'Text',

  // File mode
  '.dropzone-text': '<span>Choose a file</span> or drag & drop',

  // Paste mode
  '#paste-area': { placeholder: 'Paste your text or code here...' },

  // Options
  'label[for="ttl"]': 'Duration',
  '#ttl option[value="15"]': '15 minutes',
  '#ttl option[value="30"]': '30 minutes',
  '#ttl option[value="60"]': '1 hour',
  '#ttl option[value="180"]': '3 hours',
  '#ttl option[value="360"]': '6 hours',
  '#ttl option[value="720"]': '12 hours',
  '#ttl option[value="1440"]': '24 hours',
  'label[for="password"]': 'Password',
  '#password': { placeholder: 'Optional' },

  // Upload button
  '#upload-btn': 'Send',

  // Progress
  '#progress-text': 'Uploading...',

  // Result view
  '#result-view h2': 'File is online',
  '#copy-btn': 'Copy',
  '#new-upload': 'Send another file',

  // Privacy footer
  '#privacy-footer': 'No account \u00b7 No cookies \u00b7 Files auto-deleted after expiration<br><a href="#" onclick="showLegal();return false;" style="color:#555;text-decoration:none;">Legal notice</a>',

  // Paste view
  '#paste-view > .subtitle': 'Shared text',
  '#pv-password': { placeholder: 'Password required' },
  '#pv-unlock': 'Unlock',
  '#pv-error': 'Incorrect password',
  '#pv-copy': 'Copy',
  '#pv-raw': 'Raw (.txt)',
  '#paste-view .btn-report': 'Report this content',
  '#paste-report-reason option[value="Contenu illegal"]': 'Illegal content',
  '#paste-report-reason option[value*="droits"]': 'Copyright infringement',
  '#paste-report-reason option[value*="haineux"]': 'Hateful or violent content',
  '#paste-report-reason option[value="Autre"]': 'Other',
  '#paste-report-form .btn-report-confirm': 'Confirm report',
  '#paste-view .legal-link a': 'Legal notice',

  // Download view
  '#download-view > .subtitle': 'Shared file',
  '#dl-password': { placeholder: 'Password required' },
  '#dl-error': 'Incorrect password',
  '#dl-btn': 'Download',
  '#report-btn': 'Report this file',
  '#report-reason option[value="Contenu illegal"]': 'Illegal content',
  '#report-reason option[value*="droits"]': 'Copyright infringement',
  '#report-reason option[value*="haineux"]': 'Hateful or violent content',
  '#report-reason option[value="Autre"]': 'Other',
  '#report-form .btn-report-confirm': 'Confirm report',
  '#report-success': 'File deleted. Thank you for reporting.',
  '#download-view .legal-link a': 'Legal notice',

  // Legal modal
  '#legal-modal .modal h2': 'Legal notice & Terms of Use',
  '#legal-modal .modal h3:nth-of-type(1)': 'Publisher and host',
  '#legal-modal .modal p:nth-of-type(1)': 'This service is published and hosted by an individual for personal use.<br>Contact: <strong>contact@purvanas.fr</strong>',
  '#legal-modal .modal h3:nth-of-type(2)': 'Service description',
  '#legal-modal .modal p:nth-of-type(2)': 'FileDrop enables temporary file sharing. Files are automatically deleted after the duration chosen by the user (15 min to 24h). No user account is required.',
  '#legal-modal .modal h3:nth-of-type(3)': 'Personal data',
  '#legal-modal .modal p:nth-of-type(3)': 'No cookies or third-party analytics are used. IP addresses may appear in technical logs and reports to operate and moderate the service.',
  '#legal-modal .modal h3:nth-of-type(4)': 'Use of the service',
  '#legal-modal .modal p:nth-of-type(4)': 'Content is stored temporarily. Users remain responsible for the files they share and must hold the necessary rights.',
  '#legal-modal .modal h3:nth-of-type(5)': 'Prohibited content',
  '#legal-modal .modal p:nth-of-type(5)': 'It is forbidden to use this service to share: child sexual abuse material, content inciting hatred or violence, content infringing copyright, any content that violates applicable French law.',
  '#legal-modal .modal h3:nth-of-type(6)': 'Reporting',
  '#legal-modal .modal p:nth-of-type(6)': 'Each sharing page provides a Report button. A report triggers automatic deletion when the content is still present; the contact address above remains available if needed.',
  '#legal-modal .modal-close': 'Close',

  // Cross-links
  '#cross-links a:nth-child(1)': '<span style="color:#7c4dff">\u2193</span> Download a video',
  '#cross-links a:nth-child(2)': '<span style="color:#f59e0b">\u2699</span> Convert a file',
  '#cross-links a:nth-child(3)': '<span style="color:#22c55e">\u25a6</span> QR Code Generator',

  // SEO content
  'div[style*="max-width:480px"][style*="border-top"] h2:first-of-type': 'Send large files for free',
  'div[style*="max-width:480px"][style*="border-top"] > p:nth-of-type(1)': 'FileDrop keeps the flow short: upload a file, get a link, and share it. No account, cookies, or third-party audience measurement. The file is automatically deleted after the selected duration.',

  // Project positioning
  'div[style*="max-width:480px"][style*="border-top"] h3:nth-of-type(1)': 'Temporary sharing, no account required',
  'div[style*="max-width:480px"][style*="border-top"] > p:nth-of-type(2)': 'This instance accepts files up to 500 MB, offers optional password protection, and can also share text. Links expire between 15 minutes and 24 hours.',

  'div[style*="max-width:480px"][style*="border-top"] h3:nth-of-type(2)': 'How to send a file too large for email',
  'div[style*="max-width:480px"][style*="border-top"] > p:nth-of-type(3)': 'When an attachment is rejected by email, share a temporary link instead:',
  'div[style*="max-width:480px"][style*="border-top"] ol li:nth-child(1)': 'Drop your file on FileDrop (up to 500 MB)',
  'div[style*="max-width:480px"][style*="border-top"] ol li:nth-child(2)': 'Choose an expiration duration (1h for a quick send, 24h to give them time)',
  'div[style*="max-width:480px"][style*="border-top"] ol li:nth-child(3)': 'Add a password if the content is confidential',
  'div[style*="max-width:480px"][style*="border-top"] ol li:nth-child(4)': 'Copy the link and paste it in your email, SMS, or message',
  'div[style*="max-width:480px"][style*="border-top"] ol li:nth-child(5)': 'The recipient clicks and downloads \u2014 no account needed',

  'div[style*="max-width:480px"][style*="border-top"] h3:nth-of-type(3)': 'Share code or text \u2014 Pastebin alternative',
  'div[style*="max-width:480px"][style*="border-top"] > p:nth-of-type(4)': 'The "Text" tab turns FileDrop into a temporary Pastebin. Paste a code snippet, an error log, a config file, a WiFi password, or some notes. Unlike Pastebin, the content is automatically deleted after expiration. Nothing stays indexed on the internet indefinitely. You can also protect the paste with a password.',

  'div[style*="max-width:480px"][style*="border-top"] h3:nth-of-type(4)': 'Privacy and security',
  'div[style*="max-width:480px"][style*="border-top"] > p:nth-of-type(5)': 'FileDrop is hosted on a private server in France. No cookies or third-party analytics are used. Large files are uploaded in 5 MB chunks and assembled as streams. Each new sharing link uses a random 128-bit identifier. Files are deleted from disk after expiration, with no application-level backup.',

  // FAQ
  'div[style*="max-width:480px"][style*="border-top"] div[style*="margin-top:1.5rem"] h2': 'Frequently asked questions',
  'div[style*="max-width:480px"][style*="border-top"] details:nth-of-type(1) summary': 'What is the maximum file size?',
  'div[style*="max-width:480px"][style*="border-top"] details:nth-of-type(1) p': '500 MB per file. The upload uses 5 MB chunks, which allows it to bypass CDN limits like Cloudflare and ensures reliable uploads even with an unstable connection. If your file exceeds 500 MB, compress it to ZIP or RAR before sending.',
  'div[style*="max-width:480px"][style*="border-top"] details:nth-of-type(2) summary': 'How long are files kept?',
  'div[style*="max-width:480px"][style*="border-top"] details:nth-of-type(2) p': 'You choose the duration: 15 minutes, 30 minutes, 1 hour, 3 hours, 6 hours, 12 hours, or 24 hours. After that, the file is removed from application storage and is no longer available through the link.',
  'div[style*="max-width:480px"][style*="border-top"] details:nth-of-type(3) summary': 'Why use FileDrop?',
  'div[style*="max-width:480px"][style*="border-top"] details:nth-of-type(3) p': 'For one-off sharing of a file or text without creating an account, with short expiration and optional password protection.',
  'div[style*="max-width:480px"][style*="border-top"] details:nth-of-type(4) summary': 'Does the recipient need to create an account?',
  'div[style*="max-width:480px"][style*="border-top"] details:nth-of-type(4) p': 'No. The recipient clicks the link and downloads directly. No account, no app to install, no ads to watch.',
  'div[style*="max-width:480px"][style*="border-top"] details:nth-of-type(5) summary': 'Are my files secure?',
  'div[style*="max-width:480px"][style*="border-top"] details:nth-of-type(5) p': 'The transfer uses HTTPS (encryption in transit via Cloudflare). You can add a password to protect file access. For highly sensitive content, we recommend encrypting the file before uploading (using 7-Zip or VeraCrypt for example).',
  'div[style*="max-width:480px"][style*="border-top"] details:nth-of-type(6) summary': 'How do I report an illegal file?',
  'div[style*="max-width:480px"][style*="border-top"] details:nth-of-type(6) p': 'Each download page has a "Report this file" button. The report is logged and triggers automatic deletion when the content is still present.',

  // Open source note
  'div[style*="max-width:480px"][style*="border-top"] > p:last-child': 'FileDrop is open source. <a href="https://github.com/Purvanas/file-drop" style="color:#444;text-decoration:none">Source code on GitHub</a>',
}});
