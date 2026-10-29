# Job-Hunter application assistant

1. Keep your Job-Hunter server running; local default is 127.0.0.1:3001.
2. Extract the downloaded ZIP into a folder.
3. Open chrome://extensions, enable Developer mode, select Load unpacked and choose that folder.
4. In Job-Hunter Workspace → Settings, create a connection token. Enter your trusted HTTPS workspace origin in the popup, approve connection permission for that domain, then paste the token. For local development retain the default API origin.
5. On an application page, open the extension and choose Fill contact fields. Review all fields and submit yourself.

The token is kept in extension session storage only; revoke it in Job-Hunter Settings. The extension refreshes the profile before every fill. It only fills empty, visible native input fields with recognized labels for name, email, phone, location, LinkedIn and website. It never clicks submit, overwrites existing answers, uploads files, or fills demographic/work-authorization/salary questions. Embedded cross-origin frames and custom controls are unsupported. No browsing history is collected and no scripts run until you click Fill. Profile requests go only to the workspace origin you selected. Never paste a connection token into an untrusted domain.
