# Speed Reader

A web-based speed reading application that helps users improve their reading speed and comprehension. The application supports plain text, PDF, and EPUB files, offering a distraction-free reading experience with customizable settings.

## Features

- **Multiple File Formats**: Support for plain text, PDF, and EPUB files
- **Customizable Reading Experience**:
  - Adjustable words per minute (WPM) setting
  - Configurable word chunk size
  - Customizable font size and family
  - Adjustable content height
  - Multiple color themes
  - Progress bar customization
- **Reading Controls**:
  - Play/Pause functionality
  - Progress tracking
  - Chapter navigation for EPUB files
  - Rewind and skip controls
  - Keyboard shortcuts
- **User Interface**:
  - Clean, distraction-free design
  - Dark/Light theme support
  - Mobile-responsive layout
  - Context menu for quick actions
- **Additional Features**:
  - Reading history
  - Drag and drop file upload
  - Progress saving for EPUB books
  - Tooltips for better usability

## Keyboard Shortcuts

- `Space`: Play/Pause reading
- `←/→`: Skip words (hold for faster skipping)
- `Enter`: Start reading
- `n`, `Backspace`, `Delete`, `Escape`: Return to text input
- `h`: Show reading history
- `s`: Open settings
- `1-5`: Quick select from reading history

## Color Themes

The application includes several color themes to suit different reading preferences:
- Default
- Sepia
- High Contrast
- Blue Light Filter
- Mint
- Sunset
- Night Owl
- Coffee
- Ocean
- Forest
- Rose
- Lavender
- Terminal

## Technical Details

- Built with vanilla JavaScript
- Uses EPUB.js for EPUB file handling
- PDF.js for PDF file processing
- DOMPurify for text sanitization
- Local storage for settings and progress persistence
- Responsive design with mobile support

## Browser Support

The application is compatible with modern browsers that support:
- ES6+ JavaScript
- File API
- Local Storage
- CSS Variables
- SVG

## File Size Limits

- Maximum file size: 10MB
- Supported file types:
  - Plain text (.txt)
  - PDF files (.pdf)
  - EPUB files (.epub)

## Installation

1. Clone the repository
2. Install dependencies (if any)
3. Serve the application using a web server
4. Access the application through your web browser

## Usage

1. Open the application in your web browser
2. Either:
   - Paste text directly into the input area
   - Drag and drop a file
   - Use the context menu to upload a file
3. Click "Start Reading" or press Enter
4. Adjust settings as needed
5. Use the controls to navigate through the text

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details. 
