(function () {
  // Helpers
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // Current user state
  let currentUser = null;

  const toastEl = $("#toast");
  let toast;
  if (toastEl && window.bootstrap) {
    toast = new bootstrap.Toast(toastEl, { delay: 2500 });
  }
  function showToast(msg, variant = "primary") {
    if (!toastEl) return;
    toastEl.className = `toast align-items-center text-bg-${variant} border-0`;
    $("#toastBody").textContent = msg;
    toast && toast.show();
  }

  function debounce(fn, wait = 300) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  }

  function imgWithFallback(src, alt = "") {
    const img = document.createElement("img");
    img.alt = alt;
    img.loading = "lazy";
    img.className = "w-100 rounded shadow-sm poster";
    const fallback = (window.APP_CONFIG && window.APP_CONFIG.fallbackPoster) || "";
    img.src = src || fallback;
    img.onerror = () => {
      if (img.src !== fallback) img.src = fallback;
    };
    return img;
  }

  async function apiGet(url) {
    const r = await fetch(url, { credentials: "same-origin" });
    if (!r.ok) throw new Error(`GET ${url} failed`);
    return r.json();
  }
  async function apiPost(url, body) {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(body || {}),
    });
    if (!r.ok) throw new Error(`POST ${url} failed`);
    return r.json().catch(() => ({}));
  }

  // Theme toggle
  const themeToggle = $("#themeToggle");
  const rootHtml = document.documentElement;
  function setTheme(theme) {
    rootHtml.setAttribute("data-bs-theme", theme);
    localStorage.setItem("theme", theme);
  }
  function initTheme() {
    const saved = localStorage.getItem("theme");
    if (saved === "dark" || saved === "light") {
      setTheme(saved);
    } else {
      setTheme("light");
    }
  }
  themeToggle && themeToggle.addEventListener("click", () => {
    const current = rootHtml.getAttribute("data-bs-theme") || "light";
    setTheme(current === "light" ? "dark" : "light");
  });
  initTheme();

  // Login page: nothing dynamic here.

  // Dashboard behavior
  const searchInput = $("#searchInput");
  const clearSearchBtn = $("#clearSearchBtn");
  const searchSection = $("#searchSection");
  const searchResults = $("#searchResults");
  const libraryGrid = $("#libraryGrid");
  const pagination = $("#pagination");

  if (libraryGrid) {
    initializeApp();
  }

  async function initializeApp() {
    try {
      // Get current user info
      const userStatus = await apiGet('/auth/status');
      if (userStatus.authenticated) {
        currentUser = userStatus.username;
      }
      loadLibrary(1);
    } catch (error) {
      console.error('Failed to get user status:', error);
      loadLibrary(1);
    }
  }

  const doSearch = debounce(async () => {
    const q = (searchInput.value || "").trim();
    if (!q) {
      searchSection.classList.add("d-none");
      searchResults.innerHTML = "";
      return;
    }
    try {
      const data = await apiGet(`/api/movies/search?q=${encodeURIComponent(q)}`);
      renderSearchResults(data.results || []);
      searchSection.classList.remove("d-none");
    } catch (e) {
      console.error(e);
      showToast("Search failed", "danger");
    }
  }, 350);

  searchInput && searchInput.addEventListener("input", doSearch);
  clearSearchBtn && clearSearchBtn.addEventListener("click", () => {
    searchInput.value = "";
    searchSection.classList.add("d-none");
    searchResults.innerHTML = "";
  });

  function renderSearchResults(results) {
    searchResults.innerHTML = "";
    if (!results.length) {
      searchResults.innerHTML = `<div class="text-muted">No results</div>`;
      return;
    }
    const frag = document.createDocumentFragment();
    results.forEach((r) => {
      const col = document.createElement("div");
      col.className = "col-6 col-sm-4 col-md-3 col-lg-2";
      const card = document.createElement("div");
      card.className = "card h-100";
      const img = imgWithFallback(r.poster_url, r.title);
      img.classList.add("card-img-top");
      const body = document.createElement("div");
      body.className = "card-body p-2";
      const title = document.createElement("div");
      title.className = "small fw-semibold text-truncate";
      title.title = r.title || "";
      title.textContent = r.title || "";
      const meta = document.createElement("div");
      meta.className = "small text-muted";
      meta.textContent = r.year ? String(r.year) : "";
      const addBtn = document.createElement("button");
      addBtn.className = "btn btn-sm btn-primary w-100 mt-2";
      addBtn.textContent = "Add";
      addBtn.addEventListener("click", async () => {
        addBtn.disabled = true;
        addBtn.textContent = "Adding…";
        try {
          const res = await apiPost("/api/movies", { tmdb_id: r.tmdb_id });
          if (res && res.ok) {
            showToast("Added to library", "success");
            // Return to library view so the user sees the new movie
            if (searchInput) searchInput.value = "";
            if (searchSection) searchSection.classList.add("d-none");
            if (searchResults) searchResults.innerHTML = "";
            loadLibrary(1);
            // Bring the library into view for good measure
            if (libraryGrid && libraryGrid.scrollIntoView) {
              libraryGrid.scrollIntoView({ behavior: "smooth", block: "start" });
            }
          } else {
            showToast(res.error || "Failed to add", "danger");
          }
        } catch (e) {
          console.error(e);
          showToast("Failed to add", "danger");
        } finally {
          addBtn.disabled = false;
          addBtn.textContent = "Add";
        }
      });

      body.appendChild(title);
      body.appendChild(meta);
      body.appendChild(addBtn);
      card.appendChild(img);
      card.appendChild(body);
      col.appendChild(card);
      frag.appendChild(col);
    });
    searchResults.appendChild(frag);
  }

  async function loadLibrary(page) {
    try {
      const data = await apiGet(`/api/movies?page=${page || 1}`);
      renderLibrary(data.items || []);
      renderPagination(data.total_pages || 1, data.page || 1);
    } catch (e) {
      console.error(e);
      showToast("Failed to load library", "danger");
    }
  }

  function renderLibrary(items) {
    libraryGrid.innerHTML = "";
    if (!items.length) {
      libraryGrid.innerHTML = `<div class="text-muted">No movies yet. Search above to add your first.</div>`;
      return;
    }
    const frag = document.createDocumentFragment();
    items.forEach((m) => {
      const col = document.createElement("div");
      col.className = "col-12 col-lg-6";
      
      // Create new card structure based on example
      const card = document.createElement("div");
      card.className = "movie-card";
      
      const top = document.createElement("div");
      top.className = "movie-top";
      
      const img = imgWithFallback(m.poster_url, m.title);
      img.className = "movie-poster";
      
      const meta = document.createElement("div");
      meta.className = "movie-meta";
      
      const title = document.createElement("h3");
      title.className = "movie-title";
      title.textContent = m.title || "";
      if (m.year) {
        title.innerHTML = `${m.title} <span style="opacity:.7;font-weight:500">(${m.year})</span>`;
      }
      
      // All user ratings section
      const ratingsSection = document.createElement("div");
      const ratingsLabel = document.createElement("div");
      ratingsLabel.className = "section-label";
      ratingsLabel.textContent = "Ratings";
      ratingsSection.appendChild(ratingsLabel);
      
      // Show all user ratings (both read-only and interactive for current user)
      const users = ["Alex", "Carrie"];
      users.forEach(username => {
        const row = document.createElement("div");
        row.className = "rating-row";
        
        const who = document.createElement("div");
        who.className = "who";
        const chip = document.createElement("span");
        chip.className = currentUser === username ? "chip chip-interactive" : "chip";
        chip.textContent = username;
        who.appendChild(chip);
        
        // If this is the current user, show interactive rating system
        if (currentUser === username) {
          const ratingContainer = document.createElement("div");
          ratingContainer.style.display = "flex";
          ratingContainer.style.alignItems = "center";
          ratingContainer.style.gap = "10px";
          
          // Create animated rating system
          const ratingForm = document.createElement("form");
          ratingForm.className = "rating";
          ratingForm.id = `rating-${m.id}`;
          
          const starsContainer = document.createElement("div");
          starsContainer.className = "rating__stars";
          
          // Create radio inputs first, then labels (for CSS sibling selectors to work)
          const inputs = [];
          const labels = [];
          
          for (let i = 1; i <= 5; i++) {
            const input = document.createElement("input");
            input.id = `${m.id}-star-${i}`;
            input.className = `rating__input rating__input-${i}`;
            input.type = "radio";
            input.name = `rating-${m.id}`;
            input.value = i;
            input.dataset.movieId = m.id;
            input.addEventListener("change", handleAnimatedStarClick);
            inputs.push(input);
            
            const label = document.createElement("label");
            label.className = "rating__label";
            label.setAttribute("for", `${m.id}-star-${i}`);
            label.innerHTML = '<span class="rating__star"></span>';
            labels.push(label);
          }
          
          // Append all inputs first, then all labels
          inputs.forEach(input => starsContainer.appendChild(input));
          labels.forEach(label => starsContainer.appendChild(label));
          
          ratingForm.appendChild(starsContainer);
          
          const readout = document.createElement("span");
          readout.className = "rating-readout";
          readout.id = `rating-readout-${m.id}`;
          readout.textContent = "No rating";
          
          ratingContainer.appendChild(ratingForm);
          ratingContainer.appendChild(readout);
          
          row.appendChild(who);
          row.appendChild(ratingContainer);
        } else {
          // Show read-only rating
          const ratingDisplay = document.createElement("div");
          ratingDisplay.className = "rating-display";
          
          if (m.ratings && m.ratings[username]) {
            const rating = m.ratings[username];
            ratingDisplay.innerHTML = `<div class="rating-readout">${rating}/5 — ${getRatingAdjective(rating)}</div>`;
          } else {
            ratingDisplay.innerHTML = `<div class="rating-readout">No rating</div>`;
          }
          
          row.appendChild(who);
          row.appendChild(ratingDisplay);
        }
        
        ratingsSection.appendChild(row);
      });

      // Tags section
      const tagsSection = document.createElement("div");
      const tagsLabel = document.createElement("div");
      tagsLabel.className = "section-label";
      tagsLabel.textContent = "Tags";
      tagsSection.appendChild(tagsLabel);
      
      const tagsContainer = document.createElement("div");
      tagsContainer.className = "tags";
      tagsContainer.id = `tags-${m.id}`;
      tagsSection.appendChild(tagsContainer);
      
      const tagCounter = document.createElement("div");
      tagCounter.className = "tag-counter";
      tagCounter.id = `tag-counter-${m.id}`;
      tagCounter.textContent = "0 tags selected";
      tagsSection.appendChild(tagCounter);
      
      // Tag input for adding new tags
      if (currentUser) {
        const tagInputContainer = document.createElement("div");
        tagInputContainer.className = "tag-input-container";
        
        const tagInput = document.createElement("input");
        tagInput.type = "text";
        tagInput.className = "tag-input";
        tagInput.placeholder = "Add tag...";
        tagInput.addEventListener("keypress", (e) => {
          if (e.key === "Enter" && tagInput.value.trim()) {
            addTag(m.id, tagInput.value.trim());
            tagInput.value = "";
          }
        });
        
        // Create dropdown for suggestions
        const suggestionsDropdown = document.createElement("div");
        suggestionsDropdown.className = "tag-suggestions";
        suggestionsDropdown.id = `dropdown-${m.id}`;
        suggestionsDropdown.style.display = "none";
        
        const inputWrapper = document.createElement("div");
        inputWrapper.className = "tag-input-wrapper";
        inputWrapper.appendChild(tagInput);
        inputWrapper.appendChild(suggestionsDropdown);
        
        tagInputContainer.appendChild(inputWrapper);
        
        // Handle input focus/blur and typing for suggestions
        tagInput.addEventListener("focus", () => showTagSuggestions(m.id, tagInput.value));
        tagInput.addEventListener("input", () => showTagSuggestions(m.id, tagInput.value));
        tagInput.addEventListener("blur", (e) => {
          setTimeout(() => {
            document.getElementById(`dropdown-${m.id}`).style.display = "none";
          }, 200);
        });
        
        tagsSection.appendChild(tagInputContainer);
      }

      // Assemble the card
      meta.appendChild(title);
      meta.appendChild(ratingsSection);
      meta.appendChild(tagsSection);
      
      top.appendChild(img);
      top.appendChild(meta);
      card.appendChild(top);
      
      col.appendChild(card);
      frag.appendChild(col);

      // Load existing rating and tags only if user is logged in
      if (currentUser) {
        loadMovieRating(m.id);
        loadMovieTags(m.id);
      }
    });
    libraryGrid.appendChild(frag);
  }

  function renderPagination(totalPages, currentPage) {
    pagination.innerHTML = "";
    if (totalPages <= 1) return;

    const createItem = (label, page, active = false, disabled = false) => {
      const li = document.createElement("li");
      li.className = `page-item ${active ? "active" : ""} ${disabled ? "disabled" : ""}`;
      const a = document.createElement("a");
      a.className = "page-link";
      a.href = "#";
      a.textContent = label;
      a.addEventListener("click", (e) => {
        e.preventDefault();
        if (!disabled) loadLibrary(page);
      });
      li.appendChild(a);
      return li;
    };

    pagination.appendChild(createItem("«", Math.max(1, currentPage - 1), false, currentPage === 1));

    const start = Math.max(1, currentPage - 2);
    const end = Math.min(totalPages, currentPage + 2);
    for (let p = start; p <= end; p++) {
      pagination.appendChild(createItem(String(p), p, p === currentPage));
    }

    pagination.appendChild(createItem("»", Math.min(totalPages, currentPage + 1), false, currentPage === totalPages));
  }

  // Old star rating functions removed - using new animated star system

  async function loadMovieRating(movieId) {
    try {
      const result = await apiGet(`/api/movies/${movieId}/review`);
      if (result.rating !== null && result.rating > 0) {
        // Update the animated star rating
        const input = document.querySelector(`input[name="rating-${movieId}"][value="${result.rating}"]`);
        if (input) {
          input.checked = true;
          updateAnimatedStarReadout(movieId, result.rating);
        }
      }
    } catch (error) {
      console.error("Error loading rating:", error);
    }
  }

  // Tags functionality
  async function addTag(movieId, tagName) {
    try {
      const result = await apiPost(`/api/movies/${movieId}/tags`, { name: tagName });
      if (result.ok) {
        loadMovieTags(movieId);
        showToast(`Tag "${tagName}" added`, "success");
      } else {
        showToast(result.error || "Failed to add tag", "danger");
      }
    } catch (error) {
      console.error("Error adding tag:", error);
      showToast("Failed to add tag", "danger");
    }
  }

  async function removeTag(movieId, tagId, tagName) {
    try {
      await fetch(`/api/movies/${movieId}/tags/${tagId}`, { 
        method: "DELETE",
        credentials: "same-origin" 
      });
      loadMovieTags(movieId);
      showToast(`Tag "${tagName}" removed`, "success");
    } catch (error) {
      console.error("Error removing tag:", error);
      showToast("Failed to remove tag", "danger");
    }
  }

  async function loadMovieTags(movieId) {
    try {
      const result = await apiGet(`/api/movies/${movieId}/tags`);
      const tagsContainer = document.getElementById(`tags-${movieId}`);
      const tagCounter = document.getElementById(`tag-counter-${movieId}`);
      if (!tagsContainer) return;
      
      tagsContainer.innerHTML = "";
      const tagCount = result.tags ? result.tags.length : 0;
      
      if (result.tags && result.tags.length > 0) {
        result.tags.forEach((tag, index) => {
          const tagButton = document.createElement("button");
          tagButton.className = `tag p${(index % 7) + 1}`;
          tagButton.type = "button";
          tagButton.dataset.selected = "true";
          tagButton.dataset.tagId = tag.id;
          tagButton.innerHTML = `<span class="dot"></span>${tag.name}`;
          
          // Add click handler to remove tag
          tagButton.addEventListener("click", () => {
            removeTag(movieId, tag.id, tag.name);
          });
          
          tagsContainer.appendChild(tagButton);
        });
      }
      
      // Update tag counter
      if (tagCounter) {
        tagCounter.textContent = `${tagCount} tag${tagCount === 1 ? '' : 's'} selected`;
      }
      
    } catch (error) {
      console.error("Error loading tags:", error);
    }
  }

  async function showTagSuggestions(movieId, searchTerm = "") {
    try {
      const predefinedResult = await apiGet('/api/tags/predefined');
      const currentTagsResult = await apiGet(`/api/movies/${movieId}/tags`);
      const dropdown = document.getElementById(`dropdown-${movieId}`);
      if (!dropdown) return;
      
      const currentTagNames = (currentTagsResult.tags || []).map(tag => tag.name);
      const availableTags = predefinedResult.tags.filter(tag => 
        !currentTagNames.includes(tag.name) && 
        tag.name.toLowerCase().includes(searchTerm.toLowerCase())
      );
      
      dropdown.innerHTML = "";
      
      if (availableTags.length > 0) {
        availableTags.forEach(tag => {
          const option = document.createElement("div");
          option.className = "tag-suggestion";
          option.textContent = tag.name;
          
          option.addEventListener("mouseenter", () => {
            // Only apply tag colors in light mode
            if (document.documentElement.getAttribute("data-bs-theme") !== "dark") {
              option.style.backgroundColor = tag.color;
            }
          });
          option.addEventListener("mouseleave", () => {
            option.style.backgroundColor = "";
          });
          option.addEventListener("click", () => {
            addTag(movieId, tag.name);
            const input = dropdown.closest('.tag-input-wrapper').querySelector('.tag-input');
            if (input) input.value = "";
            dropdown.style.display = "none";
          });
          
          dropdown.appendChild(option);
        });
        dropdown.style.display = "block";
      } else if (searchTerm.trim()) {
        // Show option to add custom tag
        const customOption = document.createElement("div");
        customOption.className = "tag-suggestion custom";
        customOption.textContent = `Add "${searchTerm}"`;
        
        customOption.addEventListener("click", () => {
          addTag(movieId, searchTerm);
          const input = dropdown.closest('.tag-input-wrapper').querySelector('.tag-input');
          if (input) input.value = "";
          dropdown.style.display = "none";
        });
        
        dropdown.appendChild(customOption);
        dropdown.style.display = "block";
      } else {
        dropdown.style.display = "none";
      }
    } catch (error) {
      console.error("Error loading tag suggestions:", error);
    }
  }

  // Helper functions for new UI
  function getRatingAdjective(rating) {
    const adjectives = ['Terrible', 'Bad', 'OK', 'Good', 'Excellent'];
    return adjectives[Math.ceil(rating) - 1] || 'No rating';
  }

  // Animated star functionality
  async function handleAnimatedStarClick(e) {
    const rating = parseInt(e.target.value);
    const movieId = parseInt(e.target.dataset.movieId);
    try {
      const result = await apiPost(`/api/movies/${movieId}/review`, { rating });
      if (result.ok) {
        updateAnimatedStarReadout(movieId, rating);
        showToast("Rating saved", "success");
        loadLibrary(1);
      } else {
        showToast(result.error || "Failed to save rating", "danger");
      }
    } catch (error) {
      console.error("Error saving rating:", error);
      showToast("Failed to save rating", "danger");
    }
  }

  function updateAnimatedStarReadout(movieId, rating) {
    const readout = document.getElementById(`rating-readout-${movieId}`);
    if (readout) {
      readout.textContent = rating ? `${rating}/5 — ${getRatingAdjective(rating)}` : 'No rating';
    }
  }

  // Initialize animated star SVGs
  function initializeStarSVGs() {
    const STAR = `
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <g transform="translate(16,16)"><circle class="rating__star-ring" r="8" /></g>
        <g transform="translate(16,16)">
          <path class="rating__star-stroke" d="M0,-11 L2.9,-3.8 L10.6,-3.1 L4.9,2.1 L6.5,9.7 L0,5.9 L-6.5,9.7 L-4.9,2.1 L-10.6,-3.1 L-2.9,-3.8 Z" />
          <path class="rating__star-fill" d="M0,-11 L2.9,-3.8 L10.6,-3.1 L4.9,2.1 L6.5,9.7 L0,5.9 L-6.5,9.7 L-4.9,2.1 L-10.6,-3.1 L-2.9,-3.8 Z" />
        </g>
        <g transform="translate(16,16)" stroke-dasharray="12 12" stroke-dashoffset="12">
          <polyline class="rating__star-line" transform="rotate(0)" points="0 4,0 16" />
          <polyline class="rating__star-line" transform="rotate(72)" points="0 4,0 16" />
          <polyline class="rating__star-line" transform="rotate(144)" points="0 4,0 16" />
          <polyline class="rating__star-line" transform="rotate(216)" points="0 4,0 16" />
          <polyline class="rating__star-line" transform="rotate(288)" points="0 4,0 16" />
        </g>
      </svg>`;

    // Replace empty star elements with SVG
    document.querySelectorAll('.rating__star:empty').forEach(el => {
      el.innerHTML = STAR;
    });
  }

  // Call after library renders
  const originalRenderLibrary = renderLibrary;
  renderLibrary = function(items) {
    originalRenderLibrary(items);
    // Initialize star SVGs after rendering
    setTimeout(() => {
      initializeStarSVGs();
    }, 10);
  };

  // Make functions globally available
  window.removeTag = removeTag;
})();
