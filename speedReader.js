var presentationText = [];
var currentIndex = 0;
var readingSpeed = 300; // words per minute
var wordsPerChunk = 1; // words per split
var isPlaying = false;
var playInterval;
var hiddenContentState = "all";
var keyHoldStartTime = 0;
var keyHoldInterval = null;
var currentSkipAmount = 1;
var historySelected = false;
var currentBook = null;
var currentChapter = null;
var chapterProgress = {};
var localStorageBookProgress = null;
var wakeLock = null;

// Settings variables
var settings = {
    wpm: 300,
    chunkSize: 1,
    fontSize: 2,
    contentHeight: 30,
    fontFamily: 'Arial',
    colorTheme: 'default',
    progressColor: '#4CAF50'
};

const MAX_PDF_SIZE = 10 * 1024 * 1024; // 10MB limit
const KEY_HOLD_INCREASE_INTERVAL = 1500; // 1.5 seconds
const MAX_SKIP_AMOUNT = 64;

function splitTextByWordCount(text, wordsPerChunk) {
    if (!text || wordsPerChunk < 1) return [];

    const words = text.trim().split(/\s+/); // split on any whitespace
    const chunks = [];

    for (let i = 0; i < words.length; i += wordsPerChunk) {
        const chunk = words.slice(i, i + wordsPerChunk).join(' ');
        chunks.push(chunk);
    }

    return chunks;
}

function initializeText(textInput, wordsPerChunk) {
    // sanitize text input on server before presenting here
    const sanitizedText = DOMPurify.sanitize(textInput.value.trim());
    presentationText = splitTextByWordCount(sanitizedText, wordsPerChunk);
    currentIndex = 0;
    const textElement = document.getElementById('speedReader-text');
    updateDisplay(textElement, textInput);
    updateProgressBar();
}

function updateDisplay(textElement, textInput) {
    const contentDiv = document.getElementById('speedReader-content');
    
    // Hide textarea and show content div
    if (textInput) {
        const progressContainer = document.getElementsByClassName('progress-container')[0];
        const startReadingBtn = document.getElementById('start-reading-btn');
        const leftControls = document.getElementsByClassName('left-controls')[0];
        
        textInput.style.display = 'none'; 
        progressContainer.style.display = 'block';
        leftControls.style.display = 'flex';
        startReadingBtn.style.display = 'none';
        contentDiv.style.display = 'flex';
    }
    
    // Update the text content
    if (presentationText.length > 0 && currentIndex < presentationText.length) {
        textElement.textContent = presentationText[currentIndex];
    }
}

function updateProgressBar() {
    const progressBar = document.getElementById('progress-bar');
    const progress = (currentIndex / (presentationText.length - 1)) * 100;
    progressBar.style.width = `${progress}%`;
    
    // Update chapter progress
    if (currentChapter) {
        chapterProgress[currentChapter] = [currentIndex / (presentationText.length - 1), currentIndex];
    }
}

function handleProgressBarClick(event) {
    const progressContainer = event.currentTarget;
    const rect = progressContainer.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const width = rect.width;
    const percentage = x / width;
    
    // Calculate new index based on click position
    const newIndex = Math.floor(percentage * (presentationText.length - 1));
    if (newIndex >= 0 && newIndex < presentationText.length) {
        currentIndex = newIndex;
        updateDisplay(document.getElementById('speedReader-text'));
        updateProgressBar();
    }
}

// Add new drag functionality
function setupProgressBarDrag() {
    const progressContainer = document.getElementById('progress-container');
    let isDragging = false;
    let rafId = null;

    function updateProgressFromEvent(event) {
        const rect = progressContainer.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const width = rect.width;
        const percentage = Math.max(0, Math.min(1, x / width));
        
        // Calculate new index based on drag position
        const newIndex = Math.floor(percentage * (presentationText.length - 1));
        if (newIndex >= 0 && newIndex < presentationText.length) {
            currentIndex = newIndex;
            updateDisplay(document.getElementById('speedReader-text'));
            updateProgressBar();
        }
    }

    function startDragging(event) {
        isDragging = true;
        if (isPlaying) {
            togglePlayPause();
        }
        updateProgressFromEvent(event);
    }

    function stopDragging() {
        isDragging = false;
        if (rafId) {
            cancelAnimationFrame(rafId);
            rafId = null;
        }
        localStorage.setItem(localStorageBookProgress, JSON.stringify(chapterProgress));
    }

    function handleDrag(event) {
        if (isDragging) {
            event.preventDefault();
            if (rafId) {
                cancelAnimationFrame(rafId);
            }
            rafId = requestAnimationFrame(() => {
                updateProgressFromEvent(event);
                rafId = null;
            });
        }
    }

    // Mouse events
    progressContainer.addEventListener('mousedown', startDragging);
    document.addEventListener('mousemove', handleDrag);
    document.addEventListener('mouseup', stopDragging);
    document.addEventListener('mouseleave', stopDragging);

    // // Touch events
    // progressContainer.addEventListener('touchstart', (e) => {
    //     e.preventDefault();
    //     startDragging(e.touches[0]);
    // }, { passive: false });
    // document.addEventListener('touchmove', (e) => {
    //     e.preventDefault();
    //     handleDrag(e.touches[0]);
    // }, { passive: false });
    // document.addEventListener('touchend', stopDragging);
}

async function requestWakeLock() {
  try {
    wakeLock = await navigator.wakeLock.request("screen");
    console.log("Wake Lock active");
  } catch (err) {
    // The Wake Lock request has failed - usually system related, such as battery.
    console.error(`${err.name}, ${err.message}`);
  }
}

async function togglePlayPause() {
    const playIcon = document.getElementById('play-pause-icon');
    const textElement = document.getElementById('speedReader-text');
    
    if (!isPlaying) {
      if (currentIndex === presentationText.length - 1) {
        // If we're at the end of a chapter, show chapter selection
        if (currentChapter) {
          const toc = await currentBook.toc;
          if (!toc || toc.length === 0) {
            const spine = await currentBook.spine;
            const chapters = spine.items.map((item, index) => ({
              id: item.id,
              label: `Chapter ${index + 1}`,
              href: item.href
            }));
            showChapterSelection(chapters);
          } else {
            showChapterSelection(toc);
          }
          return;
        } else {
          currentIndex = 0;
        }
      }
        
      // Start playing
      await requestWakeLock();
      isPlaying = true;
      playIcon.innerHTML = '<rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect>';
      
      const interval = (60 / readingSpeed) * 1000; // Convert WPM to milliseconds
      playInterval = setInterval(() => {
        if (currentIndex < presentationText.length - 1) {
          currentIndex++;
          updateDisplay(textElement);
          updateProgressBar();
        } else {
          togglePlayPause(); // Stop when reaching the end
        }
      }, interval);
    } else {
        // Pause
        localStorage.setItem(localStorageBookProgress, JSON.stringify(chapterProgress));
        isPlaying = false;
        playIcon.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"></polygon>';
        clearInterval(playInterval);
        if (wakeLock) {
          wakeLock.release().then(() => {
            wakeLock = null;
            console.log("Wake Lock released");
          });
        }
    }
}

function rewind10Words() {
    if (currentIndex > 0) {
        currentIndex = Math.max(0, currentIndex - 10);
        updateDisplay(document.getElementById('speedReader-text'));
        updateProgressBar();
    }
}

function goToStart() {
    isPlaying = true;
    togglePlayPause();
    currentIndex = 0;
    updateDisplay(document.getElementById('speedReader-text'));
    updateProgressBar();
}

function toggleHideContent() {
    const hideBtn = document.getElementById('hide-btn');
    const firstSvg = hideBtn.querySelector('svg:not(.show-ui)');
    const secondSvg = hideBtn.querySelector('svg.show-ui');

    if (hiddenContentState === "all") {
        hiddenContentState = "hide-right";
        const h1 = document.getElementsByTagName('h1')[0];
        const h2 = document.getElementsByTagName('h2')[0];
        const rightControls = document.getElementsByClassName('right-controls')[0];
        h1.style.display = 'none';
        h2.style.display = 'none';
        rightControls.style.display = 'none';
    } else if (hiddenContentState === "hide-right") {
        hiddenContentState = "hide-progress-and-right";
        const rightControls = document.getElementsByClassName('right-controls')[0];
        const progressContainer = document.getElementsByClassName('progress-container')[0];
        rightControls.style.display = 'none';
        progressContainer.style.display = 'none';
        // Show second SVG when everything is hidden
        firstSvg.style.display = 'none';
        secondSvg.style.display = 'block';
    } else {
        hiddenContentState = "all";
        const h1 = document.getElementsByTagName('h1')[0];
        const h2 = document.getElementsByTagName('h2')[0];
        const rightControls = document.getElementsByClassName('right-controls')[0];
        const progressContainer = document.getElementsByClassName('progress-container')[0];
        h1.style.display = 'block';
        h2.style.display = 'block';
        rightControls.style.display = 'flex';
        progressContainer.style.display = 'flex';
        // Show first SVG when showing everything
        firstSvg.style.display = 'block';
        secondSvg.style.display = 'none';
    }
}

function showTextInputAgain() {
    const textInput = document.getElementById('speedReader-text-input');
    const contentDiv = document.getElementById('speedReader-content');
    const progressContainer = document.getElementsByClassName('progress-container')[0];
    const leftControls = document.getElementsByClassName('left-controls')[0];
    const startReadingBtn = document.getElementById('start-reading-btn');
    const chapterSelectorBtn = document.getElementById('chapter-selector-btn');
    
    // Show text input and start button, hide content
    currentChapter = null;
    currentBook = null;
    chapterProgress = {};
    if (isPlaying) {
        togglePlayPause();
    }
    textInput.style.display = 'initial';
    textInput.value = '';
    contentDiv.style.display = 'none';
    progressContainer.style.display = 'none';
    leftControls.style.display = 'none';
    chapterSelectorBtn.style.display = 'none';
    startReadingBtn.disabled = true;
    startReadingBtn.style.display = 'block';
}

// Load settings from localStorage
function loadSettings() {
    const savedSettings = localStorage.getItem('speedReaderSettings');
    if (savedSettings) {
        settings = { ...settings, ...JSON.parse(savedSettings) };
        applySettings();
    }
}

// Save settings to localStorage
function saveSettings() {
    localStorage.setItem('speedReaderSettings', JSON.stringify(settings));
}

// Apply settings to the UI
function applySettings() {
    // Update reading speed
    readingSpeed = settings.wpm;
    wordsPerChunk = settings.chunkSize;
    
    // Update text display
    const textElement = document.getElementById('speedReader-text');
    textElement.style.fontSize = `${settings.fontSize}rem`;
    textElement.style.fontFamily = settings.fontFamily;
    
    // Update content height
    const contentDiv = document.getElementById('speedReader-content');
    contentDiv.style.height = `${settings.contentHeight}vh`;
    
    // Update color theme
    document.documentElement.setAttribute('data-color-theme', settings.colorTheme);
    
    // Update progress bar color
    const progressBar = document.getElementById('progress-bar');
    progressBar.style.backgroundColor = settings.progressColor;
    
    // Update settings UI
    document.getElementById('wpm-setting').value = settings.wpm;
    document.getElementById('wpm-value').textContent = `${settings.wpm} WPM`;
    document.getElementById('chunk-setting').value = settings.chunkSize;
    document.getElementById('chunk-value').textContent = `${settings.chunkSize} word(s)`;
    document.getElementById('size-setting').value = settings.fontSize;
    document.getElementById('size-value').textContent = `${settings.fontSize}rem`;
    document.getElementById('height-setting').value = settings.contentHeight;
    document.getElementById('height-value').textContent = `${settings.contentHeight}vh`;
    document.getElementById('font-setting').value = settings.fontFamily;
    document.getElementById('color-setting').value = settings.colorTheme;
    document.getElementById('progress-color-setting').value = settings.progressColor;
}

// Show settings modal
function showSettings() {
    const modal = document.getElementById('settings-modal');
    modal.classList.add('show');
    if (isPlaying) {
        togglePlayPause();
    }
}

// Hide settings modal
function hideSettings() {
    const modal = document.getElementById('settings-modal');
    modal.classList.remove('show');
}

// Show history modal
function showHistory() {
    const modal = document.getElementById('history-modal');
    modal.classList.add('show');
    loadHistory();
}

// Hide history modal
function hideHistory() {
    const modal = document.getElementById('history-modal');
    modal.classList.remove('show');
}

// Load history from server
async function loadHistory() {
    try {
        const response = await fetch('/speed-reader/prev');
        const history = await response.json();
        displayHistory(history.texts);
    } catch (error) {
        console.error('Error loading history:', error);
    }
}

// Display history items in the modal
function displayHistory(history) {
    const historyList = document.getElementById('history-list');
    historyList.innerHTML = '';

    if (isPlaying) togglePlayPause();

    if (history.length === 0) {
        historyList.innerHTML = '<div class="no-history">No history found</div>';
        return;
    }

    history.forEach((item, index) => {
        const historyItem = document.createElement('div');
        historyItem.className = 'history-item';
        
        // Create preview of the text (first 100 characters)
        const preview = item.text.length > 100 
            ? item.text.substring(0, 100) + '...' 
            : item.text;
        
        // Format timestamp
        const timestamp = new Date(item.timestamp).toLocaleString();
                
        historyItem.innerHTML = `
            <div class="history-item-header">
                <span class="index">${index + 1})</span>
            </div>
            <div class="preview">${preview}</div>
            <div class="metadata">
                <span class="timestamp">${timestamp}</span>
                <span class="word-count">${item.wordCount} words</span>
            </div>
        `;
        
        // Add click handler to load the text
        historyItem.addEventListener('click', () => {
            showTextInputAgain();
            const textInput = document.getElementById('speedReader-text-input');
            const startButton = document.getElementById('start-reading-btn');
            textInput.value = item.text;
            startButton.disabled = false;
            historySelected = true;
            startButton.click();
            hideHistory();
        });
        
        historyList.appendChild(historyItem);
    });
}

// Handle settings changes
function handleSettingChange(setting, value) {
    settings[setting] = value;
    applySettings();
    saveSettings();
    
    // If changing chunk size, reinitialize text
    if (setting === 'chunkSize' && presentationText.length > 0) {
        const textInput = document.getElementById('speedReader-text-input');
        initializeText(textInput, value);
    }
}

async function handleEPUBUpload(file) {
    try {
        const arrayBuffer = await file.arrayBuffer();
        // Create a Blob from the ArrayBuffer
        const blob = new Blob([arrayBuffer], { type: 'application/epub+zip' });
        // Create an object URL from the Blob
        const url = URL.createObjectURL(blob);
        
        // Initialize EPUB.js with the URL
        currentBook = ePub(url, {
            restore: false,
            openAs: 'epub'
        });
        
        // Wait for the book to be ready
        await currentBook.ready;
        
        // Show the chapter selector button
        const chapterSelectorBtn = document.getElementById('chapter-selector-btn');
        chapterSelectorBtn.style.display = 'flex';
        
        // Get metadata and table of contents
        // await currentBook.metadata;
        const toc = await currentBook.toc;
        const { metadata: {
          title,
          creator,
          pubdate,
        } } = currentBook.package;
        localStorageBookProgress = `bookProgress-${title}-${creator}-${pubdate}`;
        
        if (!toc || toc.length === 0) {
            // If no TOC, try to get chapters from spine
            const spine = await currentBook.spine;
            const chapters = spine.items.map((item, index) => ({
                id: item.id,
                label: `Chapter ${index + 1}`,
                href: item.href
            }));
            showChapterSelection(chapters);
        } else {
            showChapterSelection(toc);
        }
    } catch (error) {
        console.error('Error reading EPUB:', error);
        localStorage.removeItem(localStorageBookProgress);
        chapterProgress = {};
        currentBook = null;
        currentChapter = null;
        alert('Error reading EPUB file. Please try another file.');
    }
}

async function showChapterSelection(toc) {
    const modal = document.getElementById('chapter-modal');
    const chapterList = document.getElementById('chapter-list');
    chapterList.innerHTML = '';

    if (isPlaying) togglePlayPause();

    if (Object.keys(chapterProgress).length === 0) {
      chapterProgress = JSON.parse(localStorage.getItem(localStorageBookProgress) || '{}') || {};
    }

    if (!toc || toc.length === 0) {
        chapterList.innerHTML = '<div class="no-chapters">No chapters found</div>';
        modal.classList.add('show');
        return;
    }

    // Add book title if available
    if (currentBook && currentBook.metadata) {
        const title = currentBook.metadata.title;
        if (title) {
            const titleElement = document.createElement('div');
            titleElement.className = 'book-title';
            titleElement.textContent = title;
            chapterList.appendChild(titleElement);
        }
    }

    for (let index = 0; index < toc.length; index++) {
        const chapter = toc[index];
        if ((await loadChapterText(chapter.href)).length === 0) continue;

        const chapterItem = document.createElement('div');
        chapterItem.className = 'chapter-item';
        
        // Add selected class if this is the current chapter
        if (chapter.href === currentChapter) {
            chapterItem.classList.add('selected');
        }
        
        const progress = chapterProgress[chapter.href]?.[0] || 0;
        
        chapterItem.innerHTML = `
            <div class="title">${chapter.label || `Chapter ${index + 1}`}</div>
            <div class="progress">${Math.round(progress * 100)}% complete</div>
            <div class="progress-bar">
                <div class="progress-bar-fill" style="width: ${progress * 100}%"></div>
            </div>
        `;
        chapterItem.addEventListener('click', async () => {
            try {
                // Remove selected class from all chapters
                document.querySelectorAll('.chapter-item').forEach(item => {
                    item.classList.remove('selected');
                });
                // Add selected class to clicked chapter
                chapterItem.classList.add('selected');
                
                await loadChapter(chapter.href);
                hideChapterSelection();
            } catch (error) {
                console.error('Error loading chapter:', error);
                alert('Error loading chapter. Please try again.');
            }
        });
        
        chapterList.appendChild(chapterItem);
    };
    
    modal.classList.add('show');
}

function hideChapterSelection() {
    const modal = document.getElementById('chapter-modal');
    modal.classList.remove('show');
}

async function loadChapterText(chapterId) {
  try {
    const spine = await currentBook.spine;
    const spineItem = spine.get(spine.spineByHref[chapterId]);
    await spineItem.load(currentBook.load.bind(currentBook));
    const text = spineItem.document.body.innerHTML || spineItem.document.body.textContent;
    const sanitizedText = DOMPurify.sanitize(text || "", {
      ALLOWED_TAGS: [],
      ALLOWED_ATTR: []
    });
    return sanitizedText.trim();
  } catch (error) {
    console.error('Error loading chapter text:', error);
    throw error;
  }
}

async function loadChapter(chapterId) {
    try {
        const sanitizedText = await loadChapterText(chapterId);

        // Split into chunks and update display
        presentationText = splitTextByWordCount(sanitizedText, wordsPerChunk);
        currentIndex = chapterProgress[chapterId]?.[1] || 0;
        currentChapter = chapterId;
        
        // Update display
        const textElement = document.getElementById('speedReader-text');
        const textInput = document.getElementById('speedReader-text-input');
        updateDisplay(textElement, textInput);
        updateProgressBar();

        // Save progress
        chapterProgress[chapterId] = [currentIndex / (presentationText.length - 1), currentIndex];

        // Stop any existing playback
        if (isPlaying) {
            togglePlayPause();
        }
    } catch (error) {
        console.error('Error loading chapter:', error);
        throw error; // Re-throw to be handled by the caller
    }
}

// Modify handlePDFUpload to handle EPUB files
async function handlePDFUpload(file) {
    if (!file || (file.type !== 'application/pdf' && file.type !== 'text/plain' && file.type !== 'application/epub+zip')) {
        alert('Please upload a valid PDF, TXT or EPUB file.');
        return;
    }

    if (file.size > MAX_PDF_SIZE) {
        alert('File is too large. Please upload a file smaller than 10MB.');
        return;
    }

    try {
        if (file.type === 'application/pdf') {
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            let text = '';

            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const content = await page.getTextContent();
                const strings = content.items.map(item => item.str);
                text += strings.join(' ') + '\n';
            }

            const textInput = document.getElementById('speedReader-text-input');
            const startButton = document.getElementById('start-reading-btn');
            textInput.value = text.trim();
            startButton.disabled = false;
        } else if (file.type === 'text/plain') {
            const text = await file.text();
            const textInput = document.getElementById('speedReader-text-input');
            const startButton = document.getElementById('start-reading-btn');
            textInput.value = text.trim();
            startButton.disabled = false;
        } else if (file.type === 'application/epub+zip') {
            await handleEPUBUpload(file);
        }
    } catch (error) {
        console.error('Error reading file:', error);
        alert('Error reading file. Please try another file.');
    }
}

// Modify setupDragAndDrop to accept EPUB files
function setupDragAndDrop(textarea) {
    textarea.addEventListener('dragover', (e) => {
        e.preventDefault();
        textarea.classList.add('drag-over');
    });

    textarea.addEventListener('dragleave', () => {
        textarea.classList.remove('drag-over');
    });

    textarea.addEventListener('drop', async (e) => {
        e.preventDefault();
        textarea.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file && (file.type === 'application/pdf' || file.type === 'text/plain' || file.type === 'application/epub+zip')) {
            await handlePDFUpload(file);
        }
    });
}

function setupContextMenu(textarea) {
    const contextMenu = document.getElementById('context-menu');
    const pdfUpload = document.getElementById('pdf-upload');
    let pressTimer;

    function showContextMenu(e) {
        e.preventDefault();
        e.stopPropagation();
        
        // Get the position from either touch or mouse event
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        
        // Position the menu
        contextMenu.style.left = `${clientX}px`;
        contextMenu.style.top = `${clientY}px`;
        
        // Ensure menu stays within viewport
        const menuRect = contextMenu.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        
        if (menuRect.right > viewportWidth) {
            contextMenu.style.left = `${viewportWidth - menuRect.width}px`;
        }
        if (menuRect.bottom > viewportHeight) {
            contextMenu.style.top = `${viewportHeight - menuRect.height}px`;
        }
        
        contextMenu.classList.add('show');
    }

    function hideContextMenu(e) {
        if (!contextMenu.contains(e.target)) {
            contextMenu.classList.remove('show');
        }
    }

    // Touch events for mobile
    textarea.addEventListener('touchstart', (e) => {
        pressTimer = setTimeout(() => {
            showContextMenu(e);
        }, 500); // 500ms long press
    });

    textarea.addEventListener('touchend', () => {
        clearTimeout(pressTimer);
    });

    textarea.addEventListener('touchmove', () => {
        clearTimeout(pressTimer);
    });

    // Mouse events for desktop
    textarea.addEventListener('contextmenu', showContextMenu);

    // Hide menu when clicking/touching outside
    document.addEventListener('click', hideContextMenu);
    document.addEventListener('touchstart', hideContextMenu);

    // Handle context menu items
    document.getElementById('upload-pdf').addEventListener('click', () => {
        pdfUpload.click();
        contextMenu.classList.remove('show');
    });

    document.getElementById('paste-text').addEventListener('click', async () => {
        try {
            const startButton = document.getElementById('start-reading-btn');
            const text = await navigator.clipboard.readText();
            textarea.value = text;
            startButton.disabled = !text.trim();
        } catch (err) {
            console.error('Failed to read clipboard:', err);
        }
        contextMenu.classList.remove('show');
    });

    document.getElementById('clear-text').addEventListener('click', () => {
        const startButton = document.getElementById('start-reading-btn');
        textarea.value = '';
        startButton.disabled = true;
        contextMenu.classList.remove('show');
    });

    // Handle PDF file selection
    pdfUpload.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (file) {
        await handlePDFUpload(file);
      }
      pdfUpload.value = ''; // Reset input for repeated uploads
    });
}

function handleKeyDown(e) {
    if (!presentationText.length) return;
    
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      
      if (!keyHoldStartTime) {
        keyHoldStartTime = Date.now();
        currentSkipAmount = 1;
        
        // Initial skip
        skipText(e.key === 'ArrowRight' ? currentSkipAmount : -currentSkipAmount);
        
        // Start interval for progressive speed
        keyHoldInterval = setInterval(() => {
          const holdTime = Date.now() - keyHoldStartTime;
          const newSkipAmount = Math.min(MAX_SKIP_AMOUNT, Math.pow(2, Math.floor(holdTime / KEY_HOLD_INCREASE_INTERVAL)));
          
          if (newSkipAmount !== currentSkipAmount) {
              currentSkipAmount = newSkipAmount;
          }
          
          skipText(e.key === 'ArrowRight' ? currentSkipAmount : -currentSkipAmount);
        }, 100); // Check every 100ms
      }
    } else if (e.code === 'Space' || e.key === ' ') {
      // Prevent default only if not focused on an input, textarea or contenteditable element
      const activeElement = document.activeElement;
      const isFormField = (
        activeElement.tagName === 'INPUT' ||
        activeElement.tagName === 'TEXTAREA' ||
        activeElement.isContentEditable
      );
    
      if (!isFormField) {
        e.preventDefault();
      }
    }
}

function handleKeyUp(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    const startButton = document.getElementById('start-reading-btn');
    if (startButton.style.display === 'block') {
      startButton.click();
    }
    return;
  }

  const textInput = document.getElementById('speedReader-text-input');
  if (textInput.style.display === 'initial') return;

  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
    e.preventDefault();
    
    if (keyHoldInterval) {
      clearInterval(keyHoldInterval);
      keyHoldInterval = null;
    }
    keyHoldStartTime = 0;
    currentSkipAmount = 1;
    localStorage.setItem(localStorageBookProgress, JSON.stringify(chapterProgress));
  } else if (e.key === ' ') {
    togglePlayPause();
  } else if (e.key === 'Backspace' || e.key === 'Delete' || e.key === 'Escape' || e.key.toLowerCase() === 'n') {
    showTextInputAgain();
  } else if (e.key === 'h') {
    e.preventDefault();
    showHistory();
  } else if (e.key === 's') {
    e.preventDefault();
    showSettings();
  } 
  else if (e.key === '1' || e.key === '2' || e.key === '3' || e.key === '4' || e.key === '5') {
      const historyModal = document.getElementById('history-modal');
      if (historyModal.classList.contains('show')) {
          const historyList = historyModal.getElementsByClassName('history-list')[0];
          const index = parseInt(e.key);
          if (index >= 1 && index <= historyList.children.length) {
              const historyItem = historyList.children[index - 1];
              if (historyItem) {
                  historyItem.click();
              }
          }
      }
  }
}

function skipText(amount) {
    const newIndex = currentIndex + amount;

    if (isPlaying) {
      togglePlayPause();
    }
    
    // Check bounds
    if (newIndex >= 0 && newIndex < presentationText.length) {
        currentIndex = newIndex;
        updateDisplay(document.getElementById('speedReader-text'));
        updateProgressBar();
    }
}

// Initialize the page
document.addEventListener('DOMContentLoaded', () => {
    const themeToggle = document.getElementById('theme-toggle');
    const textInput = document.getElementById('speedReader-text-input');
    const startButton = document.getElementById('start-reading-btn');
    const playPauseBtn = document.getElementById('play-pause-btn');
    const rewind10Btn = document.getElementById('rewind-10-btn');
    const toStartBtn = document.getElementById('to-start-btn');
    const hideBtn = document.getElementById('hide-btn');
    const addTextBtn = document.getElementById('add-text-btn');
    const settingsBtn = document.getElementById('settings-btn');
    const closeSettingsBtn = document.getElementById('close-settings');
    const progressContainer = document.getElementById('progress-container');
    const historyBtn = document.getElementById('history-btn');
    const closeHistoryBtn = document.getElementById('close-history');
    const chapterSelectorBtn = document.getElementById('chapter-selector-btn');
    const selectSelected = document.getElementById('font-preview');
    const selectOptions = document.querySelector('.select-options');
    const fontSetting = document.getElementById('font-setting');
    const modalContent = document.getElementsByClassName('modal-content')[0];

    modalContent.addEventListener('click', (e) => {
        if (e.target.id === 'font-preview') {
            const selectOptions = document.querySelector('.select-options');
            if (selectOptions.classList.contains('show')) selectOptions.classList.add('show');
            else selectOptions.classList.remove('show');
        } else if (!e.target.closest('.select-options')) {
            const selectOptions = document.querySelector('.select-options');
            if (selectOptions.classList.contains('show')) {
                selectOptions.classList.remove('show');
            }
        }
    });

    // Toggle dropdown
    selectSelected.addEventListener('click', () => {
        selectOptions.classList.toggle('show');
    });

    // Handle option selection
    selectOptions.addEventListener('click', (e) => {
        if (e.target.classList.contains('select-option')) {
            const value = e.target.dataset.value;
            const fontFamily = e.target.style.fontFamily;
            
            // Update preview
            selectSelected.textContent = value;
            selectSelected.style.fontFamily = fontFamily;
            
            // Update hidden select
            fontSetting.value = value;
            
            // Trigger change event
            const event = new Event('change');
            fontSetting.dispatchEvent(event);
            
            // Close dropdown
            selectOptions.classList.remove('show');
        }
    });

    // Initialize preview with current font
    selectSelected.style.fontFamily = settings.fontFamily;
    
    // Tooltip configuration
    const tooltipConfig = {
        'start-reading-btn': 'Click or press Enter to start reading',
        'hide-btn': 'Toggle hide UI',
        'to-start-btn': 'Return to start',
        'play-pause-btn': 'Play/Pause (or press Spacebar)',
        'rewind-10-btn': 'Rewind 10 words',
        'add-text-btn': 'Add new text (or press n|Backspace|Delete|Escape)',
        'history-btn': 'View reading history (or press h)',
        'settings-btn': 'Settings (or press s)',
        'theme-toggle': 'Toggle dark/light mode',
        'progress-container': 'Click or press ←/→ to skip',
        'chapter-selector-btn': 'Select chapter',
        'delete-book-btn': 'Delete chapter progress',
    };

    // Setup tooltips
    function setupTooltips() {
        // Create a container for all tooltips
        const tooltipContainer = document.createElement('div');
        tooltipContainer.className = 'tooltip-container';
        document.body.appendChild(tooltipContainer);

        Object.entries(tooltipConfig).forEach(([elementId, tooltipText]) => {
            const element = document.getElementById(elementId);
            if (!element) return;

            // Create tooltip element
            const tooltip = document.createElement('div');
            tooltip.className = 'tooltip';
            tooltip.textContent = tooltipText;
            tooltipContainer.appendChild(tooltip);

            let tooltipTimeout;
            let isHovering = false;
            let delay = 700;

            if (['start-reading-btn', 'play-pause-btn', 'delete-book-btn'].includes(elementId)) {
                delay = 1200;
            }

            // Show tooltip after delay
            element.addEventListener('mouseenter', () => {
                isHovering = true;
                tooltipTimeout = setTimeout(() => {
                    if (isHovering) {
                        // Position tooltip relative to element
                        const rect = element.getBoundingClientRect();
                        tooltip.style.left = `${rect.left + (rect.width / 2)}px`;
                        tooltip.style.top = `${rect.top - tooltip.offsetHeight - 5}px`;
                        tooltip.classList.add('show');
                    }
                }, delay);
            });

            // Hide tooltip
            element.addEventListener('mouseleave', () => {
                isHovering = false;
                clearTimeout(tooltipTimeout);
                tooltip.classList.remove('show');
            });
        });
    }

    // Setup PDF.js
    //pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    
    // Setup drag and drop and context menu
    setupDragAndDrop(textInput);
    setupContextMenu(textInput);
    
    // Load saved settings
    loadSettings();
    
    // Check for saved theme preference
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
        document.documentElement.setAttribute('data-theme', savedTheme);
    }

    // Setup tooltips
    setupTooltips();

    themeToggle.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
    });

    // Enable/disable start button based on text input
    textInput.addEventListener('input', () => {
        historySelected = false;
        startButton.disabled = !textInput.value.trim();
    });

    startButton.addEventListener('click', () => {
        const text = textInput.value.trim();
        if (!!text) {
            if (!historySelected) {
              fetch('/speed-reader/add', {
                headers: {
                    'Content-Type': 'application/json'
                },
                method: 'POST',
                body: JSON.stringify({ text, timestamp: Date.now(), wordCount: text.split(/\s+/).length, }),
              }).then(res => res.json())
              .then(console.log);
            }
            historySelected = false;
            initializeText(textInput, wordsPerChunk);
        }
    });

    playPauseBtn.addEventListener('click', togglePlayPause);
    progressContainer.addEventListener('click', handleProgressBarClick);
    rewind10Btn.addEventListener('click', rewind10Words);
    toStartBtn.addEventListener('click', goToStart);
    hideBtn.addEventListener('click', toggleHideContent);
    addTextBtn.addEventListener('click', showTextInputAgain);

    // Settings event listeners
    settingsBtn.addEventListener('click', showSettings);
    closeSettingsBtn.addEventListener('click', hideSettings);
    
    // Settings inputs event listeners
    document.getElementById('wpm-setting').addEventListener('input', (e) => {
        const value = parseInt(e.target.value);
        document.getElementById('wpm-value').textContent = `${value} WPM`;
        handleSettingChange('wpm', value);
    });
    
    document.getElementById('chunk-setting').addEventListener('input', (e) => {
        const value = parseInt(e.target.value);
        document.getElementById('chunk-value').textContent = `${value} word(s)`;
        handleSettingChange('chunkSize', value);
    });
    
    document.getElementById('size-setting').addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        document.getElementById('size-value').textContent = `${value}rem`;
        handleSettingChange('fontSize', value);
    });
    
    document.getElementById('height-setting').addEventListener('input', (e) => {
        const value = parseInt(e.target.value);
        document.getElementById('height-value').textContent = `${value}vh`;
        handleSettingChange('contentHeight', value);
    });
    
    document.getElementById('font-setting').addEventListener('change', (e) => {
        handleSettingChange('fontFamily', e.target.value);
    });
    
    document.getElementById('color-setting').addEventListener('change', (e) => {
        handleSettingChange('colorTheme', e.target.value);
    });

    document.getElementById('progress-color-setting').addEventListener('change', (e) => {
        handleSettingChange('progressColor', e.target.value);
    });

    // Close modal when clicking outside
    document.getElementById('settings-modal').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) {
            const selectOptions = document.querySelector('.select-options');
            if (selectOptions.classList.contains('show')) {
                selectOptions.classList.remove('show');
            }
            hideSettings();
        }
    });

    // History modal event listeners
    historyBtn.addEventListener('click', showHistory);
    closeHistoryBtn.addEventListener('click', hideHistory);
    
    // Close history modal when clicking outside
    document.getElementById('history-modal').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) {
            hideHistory();
        }
    });

    startButton.disabled = true;
    textInput.value = ""

    // Add keyboard event listeners
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);

    const closeChapterBtn = document.getElementById('close-chapter');
    const deleteBookBtn = document.getElementById('delete-book-btn');
    
    closeChapterBtn.addEventListener('click', hideChapterSelection);
    
    deleteBookBtn.addEventListener('click', () => {
      if (confirm('Are you sure you want to delete this book\'s progress? This action cannot be undone.')) {
        // Delete the book progress from localStorage
        if (localStorageBookProgress) {
          localStorage.removeItem(localStorageBookProgress);
          chapterProgress = {};
        }
        
        // Reset the book state
        currentBook = null;
        currentChapter = null;
        localStorageBookProgress = null;
        
        // Hide the chapter selector button
        const chapterSelectorBtn = document.getElementById('chapter-selector-btn');
        chapterSelectorBtn.style.display = 'none';
        
        // Hide the modal
        hideChapterSelection();
        
        // Show the text input again
        showTextInputAgain();
      }
    });

    // Close chapter modal when clicking outside
    document.getElementById('chapter-modal').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) {
            hideChapterSelection();
        }
    });

    // Add event listener for chapter selector button
    chapterSelectorBtn.addEventListener('click', async () => {
        if (currentBook) {
            const toc = await currentBook.toc;
            if (!toc || toc.length === 0) {
                const spine = await currentBook.spine;
                const chapters = spine.items.map((item, index) => ({
                    id: item.id,
                    label: `Chapter ${index + 1}`,
                    href: item.href
                }));
                showChapterSelection(chapters);
            } else {
                showChapterSelection(toc);
            }
        }
    });

    // Setup progress bar drag functionality
    setupProgressBarDrag();
});