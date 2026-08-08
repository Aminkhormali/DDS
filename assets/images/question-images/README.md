# Question images

Place repository-managed question images in this folder or in a session-specific subfolder.

Example JSON reference from a bank in `/questions/`:

```json
"image": {
  "src": "../assets/images/question-images/radiograph-01.jpg",
  "alt": "Accessible description",
  "caption": "Optional caption"
}
```

Images uploaded through the webpage do not need to be committed here. Select them in the Add session dialog and the app will embed compressed copies into the browser-managed bank.
