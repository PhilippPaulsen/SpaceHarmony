# How to Manage the Forms Library

The "Library" feature allows you to save and load forms. To make these forms accessible to everyone on the public website (GitHub Pages), you need to follow this workflow.

## 1. Run the Server Locally
Since GitHub Pages is static (read-only), you must use your local computer to create and save new forms.

1.  Open your terminal in the project folder.
2.  Run the server:
    ```bash
    node server.js
    ```
3.  Open the local app in your browser:
    [http://localhost:3000](http://localhost:3000)
    
    > **Important**: Do not use the VS Code "Go Live" (port 5500) for saving. Use the port 3000 address provided by the server.

## 2. Create and Save Forms
1.  Generate or draw a form in the application.
2.  Click the **Save to Library** button.
3.  Enter a name (helpfully auto-suggested) and confirm.
    - The server will save the content to `collections/YourFormName.json`.
    - The server will automatically update `collections/index.json` (the list of all files).

## 3. Publish to GitHub
To share your new library with the world:

1.  Stop the server (Ctrl+C).
2.  Commit the new files in the `collections/` folder (including `index.json`) to Git:
    ```bash
    git add collections/
    git commit -m "Added new forms to library"
    git push
    ```

## 4. Result
Once GitHub Pages rebuilds (usually 1-2 minutes):
- Visitors on your website will see the updated Library list.
- They can load the forms you created.
- (They cannot save their own forms to the server, but they can download them locally).
