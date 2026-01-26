// /utils/extractPage.js
const puppeteer = require('puppeteer');
const fs        = require('fs');
const path      = require('path');

// Universal content detection patterns
const UNIVERSAL_PATTERNS = {
  // Video platforms
  video: {
    youtube: /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/g,
    vimeo: /(?:vimeo\.com\/(?:video\/)?)(\d+)/g,
    wistia: /(?:wistia\.(?:net|com)\/embed\/(?:iframe\/)?)([^?\&]+)/g,
    mp4: /\.(mp4|webm|ogg|mov|avi|mkv)(?:\?[^\s"'`]*)?/gi,
    iframe: /<iframe[^>]*src=["']([^"']+)["'][^>]*>/gi
  },
  
  // Carousel/slider frameworks
  carousels: {
    keen: /keen-slider|vw-cmp__carousel/g,
    swiper: /swiper|swiper-container/g,
    slick: /slick|slick-carousel/g,
    owl: /owl-carousel|owl-theme/g,
    bootstrap: /carousel|carousel-item/g,
    custom: /slider|carousel|gallery/g
  },
  
  // E-commerce platforms
  ecommerce: {
    shopify: /shopify|myshopify/g,
    woocommerce: /woocommerce|wp-content/g,
    magento: /magento|mage/g,
    bigcommerce: /bigcommerce/g,
    custom: /add.*cart|buy.*now|checkout/g
  },
  
  // Content management
  cms: {
    wordpress: /wp-content|wordpress/g,
    drupal: /drupal/g,
    joomla: /joomla/g,
    squarespace: /squarespace/g,
    wix: /wix/g
  },
  
  // Analytics/tracking
  tracking: {
    google: /google.*analytics|gtag|googletagmanager/g,
    facebook: /facebook.*pixel|fbq/g,
    hotjar: /hotjar/g,
    mixpanel: /mixpanel/g,
    custom: /tracking|analytics|pixel/g
  }
};

// Universal patterns for platform/framework detection
const universal_patterns = {
  ecommerce: {
    shopify: /shopify|myshopify/,
    woocommerce: /woocommerce|wp-content/,
    magento: /magento|mage/,
    bigcommerce: /bigcommerce/
  },
  cms: {
    wordpress: /wp-content|wordpress/,
    drupal: /drupal/,
    joomla: /joomla/,
    squarespace: /squarespace/,
    wix: /wix/
  },
  framework: {
    react: /react|next/,
    vue: /vue/,
    angular: /angular/
  }
};

function detectPlatformFramework(html, url) {
  let platform = 'custom';
  let framework = 'vanilla';
  const lowerHtml = html.toLowerCase();
  const lowerUrl = url.toLowerCase();

  // Platform detection
  if (universal_patterns.ecommerce.shopify.test(lowerHtml) || lowerUrl.includes('myshopify.com')) {
    platform = 'shopify';
  } else if (universal_patterns.ecommerce.woocommerce.test(lowerHtml)) {
    platform = 'woocommerce';
  } else if (universal_patterns.cms.wordpress.test(lowerHtml)) {
    platform = 'wordpress';
  }

  // Framework detection
  if (universal_patterns.framework.react.test(lowerHtml)) {
    framework = 'react';
  } else if (universal_patterns.framework.vue.test(lowerHtml)) {
    framework = 'vue';
  } else if (universal_patterns.framework.angular.test(lowerHtml)) {
    framework = 'angular';
  }

  return { platform, framework };
}

// Universal content extraction
async function extractUniversalContent(page) {
  console.log('🔍 Extracting universal content...');
  
  return await page.evaluate(() => {
    const content = {
      videos: [],
      carousels: [],
      forms: [],
      buttons: [],
      images: [],
      scripts: [],
      styles: [],
      platform: null,
      framework: null
    };
    
    // Detect platform/framework
    const html = document.documentElement.outerHTML.toLowerCase();
    const url = window.location.href;
    
    // Platform detection
    if (html.includes('shopify') || url.includes('myshopify.com')) {
      content.platform = 'shopify';
    } else if (html.includes('woocommerce') || html.includes('wp-content')) {
      content.platform = 'woocommerce';
    } else if (html.includes('wordpress')) {
      content.platform = 'wordpress';
    } else {
      content.platform = 'custom';
    }
    
    // Framework detection
    if (html.includes('react') || html.includes('next')) {
      content.framework = 'react';
    } else if (html.includes('vue')) {
      content.framework = 'vue';
    } else if (html.includes('angular')) {
      content.framework = 'angular';
    } else {
      content.framework = 'vanilla';
    }
    
    // Extract all videos
    const videoElements = document.querySelectorAll('video, iframe[src*="youtube"], iframe[src*="vimeo"], iframe[src*="wistia"]');
    videoElements.forEach((video, index) => {
      let videoData = {
        type: 'unknown',
        src: null,
        platform: null,
        id: null,
        element: video.tagName.toLowerCase()
      };
      
      if (video.tagName === 'VIDEO') {
        videoData.type = 'html5';
        videoData.src = video.src || video.currentSrc;
        videoData.poster = video.getAttribute('poster');
      } else if (video.tagName === 'IFRAME') {
        const src = video.src;
        if (src.includes('youtube')) {
          videoData.type = 'youtube';
          videoData.platform = 'youtube';
          const match = src.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
          videoData.id = match ? match[1] : null;
        } else if (src.includes('vimeo')) {
          videoData.type = 'vimeo';
          videoData.platform = 'vimeo';
          const match = src.match(/(?:vimeo\.com\/(?:video\/)?)(\d+)/);
          videoData.id = match ? match[1] : null;
        } else if (src.includes('wistia')) {
          videoData.type = 'wistia';
          videoData.platform = 'wistia';
          const match = src.match(/(?:wistia\.(?:net|com)\/embed\/(?:iframe\/)?)([^?\&]+)/);
          videoData.id = match ? match[1] : null;
        }
      }
      
      if (videoData.src || videoData.id) {
        content.videos.push(videoData);
      }
    });
    
    // Extract carousels/sliders
    const carouselSelectors = [
      '.keen-slider', '.swiper-container', '.slick-carousel', '.owl-carousel',
      '.carousel', '.slider', '.gallery', '[class*="carousel"]', '[class*="slider"]'
    ];
    
    carouselSelectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      elements.forEach(element => {
        content.carousels.push({
          type: 'carousel',
          selector: selector,
          slides: element.querySelectorAll('[class*="slide"], [class*="item"], [class*="slide"]').length,
          element: element.outerHTML.substring(0, 200)
        });
      });
    });
    
    // Extract forms
    const forms = document.querySelectorAll('form');
    forms.forEach(form => {
      content.forms.push({
        action: form.action,
        method: form.method,
        fields: Array.from(form.querySelectorAll('input, select, textarea')).map(field => ({
          type: field.type,
          name: field.name,
          placeholder: field.placeholder
        }))
      });
    });
    
    // Extract CTA buttons
    const buttons = document.querySelectorAll('button, a[href*="checkout"], a[href*="buy"], .btn, [class*="button"]');
    buttons.forEach(button => {
      const text = button.textContent.trim();
      if (text && text.length < 50) {
        content.buttons.push({
          text: text,
          href: button.href,
          type: button.type,
          class: button.className
        });
      }
    });
    
    // Extract images
    const images = document.querySelectorAll('img[src]');
    images.forEach(img => {
      if (img.src && !img.src.includes('data:')) {
        content.images.push({
          src: img.src,
          alt: img.alt,
          width: img.width,
          height: img.height
        });
      }
    });
    
    // Extract scripts and styles
    document.querySelectorAll('script[src]').forEach(script => {
      content.scripts.push(script.src);
    });
    
    document.querySelectorAll('link[rel="stylesheet"]').forEach(style => {
      content.styles.push(style.href);
    });
    
    return content;
  });
}

async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      const distance = 300;
      const timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;
        if (totalHeight >= scrollHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 200); // Faster scrolling
    });
  });
}

async function waitForWidgetsToLoad(page, maxWaitTime = 15000) {
  console.log('⏳ Waiting for widgets to initialize...');
  
  try {
    // Wait for common widget selectors with a reasonable timeout
    await Promise.race([
      page.waitForSelector('.reeview-app-widget', { timeout: maxWaitTime }).catch(() => null),
      page.waitForSelector('[data-videowise]', { timeout: maxWaitTime }).catch(() => null),
      page.waitForSelector('video', { timeout: maxWaitTime }).catch(() => null),
      page.waitForSelector('.keen-slider', { timeout: maxWaitTime }).catch(() => null),
      page.waitForSelector('.vw-cmp__carousel', { timeout: maxWaitTime }).catch(() => null),
      new Promise(resolve => setTimeout(resolve, maxWaitTime))
    ]);
    
    // Additional wait for dynamic content
    await new Promise(resolve => setTimeout(resolve, 3000));
    
  } catch (error) {
    console.log('⚠️  Widget timeout reached, continuing with extraction...');
  }
}

async function extractVideoContent(page) {
  console.log('🔍 Extracting video content from widgets...');
  
  // Wait for dynamic content and let widgets fully initialize
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  return await page.evaluate(() => {
    const videos = [];
    let globalIndex = 0;
    
    // Helper function to extract video URLs from text content
    const extractVideoUrlsFromText = (text) => {
      const urls = [];
      if (!text) return urls;
      
      // Direct video file URLs
      const videoFileMatches = text.match(/https?:\/\/[^\s"'`]+\.(?:mp4|webm|ogg|mov|avi|mkv)(?:\?[^\s"'`]*)?/gi);
      if (videoFileMatches) urls.push(...videoFileMatches);
      
      // YouTube URLs
      const youtubeMatches = text.match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/g);
      if (youtubeMatches) {
        youtubeMatches.forEach(match => {
          const videoId = match.match(/([a-zA-Z0-9_-]{11})/)[1];
          urls.push(`https://www.youtube.com/embed/${videoId}`);
        });
      }
      
      // Vimeo URLs
      const vimeoMatches = text.match(/(?:https?:\/\/)?(?:www\.)?vimeo\.com\/(?:video\/)?(\d+)/g);
      if (vimeoMatches) {
        vimeoMatches.forEach(match => {
          const videoId = match.match(/(\d+)/)[1];
          urls.push(`https://player.vimeo.com/video/${videoId}`);
        });
      }
      
      // Wistia URLs
      const wistiaMatches = text.match(/(?:https?:\/\/)?[^.\s]*\.wistia\.(?:net|com)\/(?:medias|embed)\/([a-zA-Z0-9]+)/g);
      if (wistiaMatches) {
        wistiaMatches.forEach(match => {
          const videoId = match.match(/([a-zA-Z0-9]+)$/)[1];
          urls.push(`https://fast.wistia.net/embed/iframe/${videoId}`);
        });
      }
      
      return urls;
    };
    
    // 1. First, process Keen Slider slides individually
    document.querySelectorAll('.keen-slider__slide').forEach((slide) => {
      const index = globalIndex++;
      
      // Extract video data from this specific slide
      let videoUrl = null;
      let thumbnailUrl = null;
      let title = null;
      
      // Look for meta tags within this slide
      const contentMeta = slide.querySelector('meta[itemprop="contentUrl"]');
      const thumbnailMeta = slide.querySelector('meta[itemprop="thumbnailUrl"]');
      const nameMeta = slide.querySelector('meta[itemprop="name"]');
      
      if (contentMeta) videoUrl = contentMeta.getAttribute('content');
      if (thumbnailMeta) thumbnailUrl = thumbnailMeta.getAttribute('content');
      if (nameMeta) title = nameMeta.getAttribute('content');
      
      // Also check for actual video elements within the slide
      const videoEl = slide.querySelector('video');
      if (videoEl && !videoUrl) {
        videoUrl = videoEl.src || videoEl.currentSrc;
        if (!thumbnailUrl && videoEl.getAttribute('poster')) {
          thumbnailUrl = videoEl.getAttribute('poster');
        }
      }
      
      // Look for title in the slide
      const titleEl = slide.querySelector('.vw-cmp__in-video-card--title');
      if (titleEl && !title) {
        title = titleEl.textContent.trim();
      }
      
      // Only add if we found a video URL
      if (videoUrl) {
        // Mark the slide for replacement
        slide.setAttribute('data-video-placeholder', index);
        
        videos.push({
          type: 'keen-slide',
          index,
          videoUrl,
          thumbnailUrl,
          title,
          dimensions: {
            width: slide.offsetWidth || 200,
            height: slide.offsetHeight || 355
          }
        });
        
        console.log(`Found Keen Slider video: ${title || 'Untitled'} - ${videoUrl}`);
      }
    });
    
    // 2. Extract Videowise/Reeview widget content (but skip if already processed as keen slider)
    const widgetSelectors = [
      '.reeview-app-widget',
      '[data-videowise]',
      '[class*="videowise"]:not(.keen-slider__slide)',
      '[id*="videowise"]',
      '[class*="video-widget"]',
      '[data-widget-type="video"]',
      '[data-app="videowise"]',
      '.video-reviews-widget',
      '.product-videos-widget'
    ];
    
    document.querySelectorAll(widgetSelectors.join(', ')).forEach((widget) => {
      // Skip if this widget contains keen slider slides we already processed
      if (widget.querySelector('.keen-slider__slide[data-video-placeholder]')) {
        console.log('Skipping widget that contains already processed keen slider');
        return;
      }
      
      const widgetId = widget.id || widget.className || `widget-${globalIndex}`;
      const index = globalIndex++;
      
      let videoUrls = [];
      let thumbnails = [];
      
      const findVideos = (root) => {
        // Check for video tags
        root.querySelectorAll('video').forEach(video => {
          if (video.src) videoUrls.push(video.src);
          if (video.currentSrc) videoUrls.push(video.currentSrc);
          video.querySelectorAll('source').forEach(source => {
            if (source.src) videoUrls.push(source.src);
          });
        });
        
        // Check for iframe videos
        root.querySelectorAll('iframe').forEach(iframe => {
          if (iframe.src && (iframe.src.includes('youtube') || iframe.src.includes('vimeo') || iframe.src.includes('wistia'))) {
            videoUrls.push(iframe.src);
          }
        });
        
        // Enhanced thumbnail detection
        root.querySelectorAll('img').forEach(img => {
          if (img.src && (
            img.src.includes('thumbnail') || 
            img.src.includes('preview') ||
            img.src.includes('poster') ||
            img.classList.contains('video-thumbnail') ||
            img.getAttribute('alt')?.toLowerCase().includes('video') ||
            img.closest('[class*="video"]') ||
            img.closest('[data-video]')
          )) {
            thumbnails.push(img.src);
          }
        });
        
        // Find ALL meta[itemprop="contentUrl"] and meta[itemprop="thumbnailUrl"] at any depth
        root.querySelectorAll('meta[itemprop="contentUrl"]').forEach(meta => {
          const content = meta.getAttribute('content');
          if (content) videoUrls.push(content);
        });
        root.querySelectorAll('meta[itemprop="thumbnailUrl"]').forEach(meta => {
          const content = meta.getAttribute('content');
          if (content) thumbnails.push(content);
        });
        
        // Enhanced data attribute checking
        const dataAttributes = [
          'data-video-url', 'data-video-src', 'data-src', 'data-video-id',
          'data-youtube-id', 'data-vimeo-id', 'data-wistia-id',
          'data-video-embed', 'data-embed-url', 'data-media-url'
        ];
        
        dataAttributes.forEach(attr => {
          root.querySelectorAll(`[${attr}]`).forEach(el => {
            const value = el.getAttribute(attr);
            if (value) {
              if (value.includes('http')) {
                videoUrls.push(value);
              } else if (attr.includes('youtube')) {
                videoUrls.push(`https://www.youtube.com/embed/${value}`);
              } else if (attr.includes('vimeo')) {
                videoUrls.push(`https://player.vimeo.com/video/${value}`);
              } else if (attr.includes('wistia')) {
                videoUrls.push(`https://fast.wistia.net/embed/iframe/${value}`);
              }
            }
          });
        });
        
        // Deep script analysis
        root.querySelectorAll('script').forEach(script => {
          if (script.textContent) {
            const extractedUrls = extractVideoUrlsFromText(script.textContent);
            videoUrls.push(...extractedUrls);
          }
        });
        
        // Check for JSON data in script tags or data attributes
        root.querySelectorAll('script[type="application/json"], [data-config], [data-settings]').forEach(el => {
          try {
            let jsonData = '';
            if (el.textContent) {
              jsonData = el.textContent;
            } else if (el.getAttribute('data-config')) {
              jsonData = el.getAttribute('data-config');
            } else if (el.getAttribute('data-settings')) {
              jsonData = el.getAttribute('data-settings');
            }
            
            if (jsonData) {
              const extractedUrls = extractVideoUrlsFromText(jsonData);
              videoUrls.push(...extractedUrls);
            }
          } catch (e) {
            // Ignore JSON parsing errors
          }
        });
      };
      
      // Check shadow DOM if present  
      if (widget.shadowRoot) {
        findVideos(widget.shadowRoot);
      }
      
      // Check regular DOM
      findVideos(widget);
      
      // Also check the widget's HTML content as text
      const widgetHtml = widget.outerHTML;
      const extractedUrls = extractVideoUrlsFromText(widgetHtml);
      videoUrls.push(...extractedUrls);
      
      // Mark the widget for replacement
      widget.setAttribute('data-video-placeholder', index);
      widget.style.minHeight = '200px';
      
      videos.push({
        type: 'widget',
        widgetId,
        index,
        videoUrls: [...new Set(videoUrls)], // Remove duplicates
        thumbnails: [...new Set(thumbnails)],
        originalElement: widget.outerHTML.substring(0, 500) + '...', // Truncate for logging
        widgetHtml: widgetHtml.substring(0, 1000), // Store more HTML for debugging
        dimensions: {
          width: widget.offsetWidth || widget.clientWidth || 640,
          height: widget.offsetHeight || widget.clientHeight || 360
        }
      });
    });
    
    // 3. Extract regular video elements
    document.querySelectorAll('video').forEach((video) => {
      // Skip if already part of a widget or processed
      if (video.closest('[data-video-placeholder]')) return;
      
      const index = globalIndex++;
      const sources = Array.from(video.querySelectorAll('source')).map(s => s.src);
      
      video.setAttribute('data-video-placeholder', index);
      
      videos.push({
        type: 'html5-video',
        index,
        src: video.src || video.currentSrc,
        sources,
        attributes: {
          controls: video.hasAttribute('controls'),
          autoplay: video.hasAttribute('autoplay'),
          loop: video.hasAttribute('loop'),
          muted: video.hasAttribute('muted'),
          poster: video.getAttribute('poster')
        },
        dimensions: {
          width: video.offsetWidth || video.getAttribute('width') || 640,
          height: video.offsetHeight || video.getAttribute('height') || 360
        }
      });
    });
    
    // 4. Extract YouTube/Vimeo iframes
    document.querySelectorAll('iframe[src*="youtube"], iframe[src*="youtu.be"], iframe[src*="vimeo"], iframe[src*="wistia"]').forEach((iframe) => {
      if (iframe.closest('[data-video-placeholder]')) return;
      
      const index = globalIndex++;
      const src = iframe.src;
      let videoId = '';
      let platform = '';
      
      if (src.includes('youtube') || src.includes('youtu.be')) {
        platform = 'youtube';
        videoId = src.match(/(?:embed\/|v=|youtu\.be\/)([^&\?\/]+)/)?.[1] || '';
      } else if (src.includes('vimeo')) {
        platform = 'vimeo';
        videoId = src.match(/vimeo\.com\/(?:video\/)?(\d+)/)?.[1] || '';
      } else if (src.includes('wistia')) {
        platform = 'wistia';
        videoId = src.match(/wistia\.(?:net|com)\/embed\/(?:iframe\/)?([^?\&]+)/)?.[1] || '';
      }
      
      iframe.setAttribute('data-video-placeholder', index);
      
      videos.push({
        type: platform,
        index,
        videoId,
        originalSrc: src,
        dimensions: {
          width: iframe.offsetWidth || iframe.getAttribute('width') || 640,
          height: iframe.offsetHeight || iframe.getAttribute('height') || 360
        }
      });
    });
    
    return videos;
  });
}

function reconstructVideos(html, videoMetadata) {
  let reconstructedHtml = html;
  
  videoMetadata.forEach((video) => {
    const placeholderRegex = new RegExp(`<[^>]*data-video-placeholder="${video.index}"[^>]*>(?:[\s\S]*?</[^>]+>)?`, 'g');
    
    let replacement = '';
    
    switch(video.type) {
      case 'keen-slide':
        console.log(`🎬 Reconstructing Keen Slider video: ${video.title || 'Untitled'}`);
        
        if (video.videoUrl) {
          // Create a video element for each slide
          if (video.videoUrl.match(/\.(mp4|webm|ogg|mov)(\?.*)?$/i)) {
            replacement = `<div class="video-slide" style="width: ${video.dimensions.width}px; max-width: 100%; margin: 0 auto;">
              <video width="100%" height="${video.dimensions.height}" controls style="display: block; border-radius: 8px;"${video.thumbnailUrl ? ` poster="${video.thumbnailUrl}"` : ''}>
                <source src="${video.videoUrl}" type="video/${video.videoUrl.split('.').pop().split('?')[0]}">
                Your browser does not support the video tag.
              </video>`;
            
            if (video.title) {
              replacement += `<p style="margin: 10px 0; font-weight: bold; text-align: center; font-size: 18px;">${video.title}</p>`;
            }
            
            replacement += `</div>`;
          }
        }
        
        if (!replacement && video.thumbnailUrl) {
          // Fallback to thumbnail with play button overlay
          replacement = `<div class="video-slide" style="width: ${video.dimensions.width}px; max-width: 100%; margin: 0 auto;">
            <div style="position: relative; width: 100%; height: ${video.dimensions.height}px; background: url('${video.thumbnailUrl}') center/cover; border-radius: 8px; overflow: hidden;">
              <div style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.3);">
                <div style="width: 60px; height: 60px; background: rgba(0,0,0,0.7); border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
                    <path d="M8 5v14l11-7z"/>
                  </svg>
                </div>
              </div>
            </div>`;
          
          if (video.title) {
            replacement += `<p style="margin: 10px 0; font-weight: bold; text-align: center; font-size: 18px;">${video.title}</p>`;
          }
          
          replacement += `</div>`;
        }
        break;
        
      case 'widget':
        console.log(`🎬 Reconstructing widget: ${video.widgetId.substring(0, 30)}...`);
        
        if (video.videoUrls.length > 0) {
          const videoUrl = video.videoUrls[0];
          const thumbnail = video.thumbnails[0] || '';
          
          if (videoUrl.includes('youtube') || videoUrl.includes('youtu.be')) {
            const videoId = videoUrl.match(/(?:embed\/|v=|youtu\.be\/)([^&\?\/]+)/)?.[1];
            if (videoId) {
              replacement = `<div style="position: relative; width: ${video.dimensions.width}px; height: ${video.dimensions.height}px; max-width: 100%;">
                <iframe width="100%" height="100%" src="https://www.youtube.com/embed/${videoId}?rel=0" frameborder="0" allowfullscreen></iframe>
              </div>`;
            }
          } else if (videoUrl.includes('vimeo')) {
            const videoId = videoUrl.match(/vimeo\.com\/(?:video\/)?(\d+)/)?.[1];
            if (videoId) {
              replacement = `<div style="position: relative; width: ${video.dimensions.width}px; height: ${video.dimensions.height}px; max-width: 100%;">
                <iframe width="100%" height="100%" src="https://player.vimeo.com/video/${videoId}" frameborder="0" allowfullscreen></iframe>
              </div>`;
            }
          } else if (videoUrl.includes('wistia')) {
            const videoId = videoUrl.match(/wistia\.(?:net|com)\/embed\/(?:iframe\/)?([^?\&]+)/)?.[1];
            if (videoId) {
              replacement = `<div style="position: relative; width: ${video.dimensions.width}px; height: ${video.dimensions.height}px; max-width: 100%;">
                <iframe width="100%" height="100%" src="https://fast.wistia.net/embed/iframe/${videoId}" frameborder="0" allowfullscreen></iframe>
              </div>`;
            }
          } else if (videoUrl.match(/\.(mp4|webm|ogg|mov)(\?.*)?$/i)) {
            replacement = `<video width="${video.dimensions.width}" height="${video.dimensions.height}" controls style="max-width: 100%;"${thumbnail ? ` poster="${thumbnail}"` : ''}>
              <source src="${videoUrl}" type="video/${videoUrl.split('.').pop().split('?')[0]}">
              Your browser does not support the video tag.
            </video>`;
          }
          
          if (!replacement && thumbnail) {
            replacement = `<div style="width: ${video.dimensions.width}px; height: ${video.dimensions.height}px; background: #f0f0f0; display: flex; align-items: center; justify-content: center; border: 1px solid #ddd; max-width: 100%;">
              <img src="${thumbnail}" alt="Video thumbnail" style="max-width: 100%; max-height: 100%; object-fit: cover;">
            </div>`;
          }
        }
        
        if (!replacement) {
          replacement = `<div style="width: ${video.dimensions.width}px; height: ${video.dimensions.height}px; background: #f8f9fa; display: flex; align-items: center; justify-content: center; border: 2px dashed #dee2e6; max-width: 100%; color: #6c757d;">
            <div style="text-align: center; padding: 20px;">
              <p style="margin: 0; font-size: 14px;">📹 Video Widget</p>
              <p style="margin: 5px 0 0 0; font-size: 12px; opacity: 0.7;">${video.videoUrls.length} URLs found</p>
              <details style="margin-top: 10px; font-size: 10px; text-align: left; max-width: 300px;">
                <summary style="cursor: pointer;">Debug Info</summary>
                <pre style="white-space: pre-wrap; font-size: 8px; margin: 5px 0; padding: 5px; background: #fff; border: 1px solid #ccc; max-height: 100px; overflow: auto;">${video.widgetHtml}</pre>
              </details>
            </div>
          </div>`;
        }
        
        console.log(`   → Found ${video.videoUrls.length} video URLs, ${video.thumbnails.length} thumbnails`);
        if (video.videoUrls.length === 0 && video.widgetHtml) {
          console.log(`   → Widget HTML sample: ${video.widgetHtml.substring(0, 200)}...`);
        }
        break;
        
      case 'html5-video':
        console.log(`🎬 Reconstructing HTML5 video`);
        let attrs = ['controls'];
        if (video.attributes.autoplay) attrs.push('autoplay');
        if (video.attributes.loop) attrs.push('loop');
        if (video.attributes.muted) attrs.push('muted');
        
        replacement = `<video width="${video.dimensions.width}" height="${video.dimensions.height}" ${attrs.join(' ')} style="max-width: 100%;"${video.attributes.poster ? ` poster="${video.attributes.poster}"` : ''}>`;
        
        if (video.src) {
          replacement += `<source src="${video.src}">`;
        }
        
        video.sources.forEach(src => {
          replacement += `<source src="${src}">`;
        });
        
        replacement += 'Your browser does not support the video tag.</video>';
        break;
        
      case 'youtube':
        console.log(`🎬 Reconstructing YouTube: ${video.videoId}`);
        replacement = `<div style="position: relative; width: ${video.dimensions.width}px; height: ${video.dimensions.height}px; max-width: 100%;">
          <iframe width="100%" height="100%" src="https://www.youtube.com/embed/${video.videoId}?rel=0" frameborder="0" allowfullscreen></iframe>
        </div>`;
        break;
        
      case 'vimeo':
        console.log(`🎬 Reconstructing Vimeo: ${video.videoId}`);
        replacement = `<div style="position: relative; width: ${video.dimensions.width}px; height: ${video.dimensions.height}px; max-width: 100%;">
          <iframe width="100%" height="100%" src="https://player.vimeo.com/video/${video.videoId}" frameborder="0" allowfullscreen></iframe>
        </div>`;
        break;
        
      case 'wistia':
        console.log(`🎬 Reconstructing Wistia: ${video.videoId}`);
        replacement = `<div style="position: relative; width: ${video.dimensions.width}px; height: ${video.dimensions.height}px; max-width: 100%;">
          <iframe width="100%" height="100%" src="https://fast.wistia.net/embed/iframe/${video.videoId}" frameborder="0" allowfullscreen></iframe>
        </div>`;
        break;
    }
    
    if (replacement) {
      reconstructedHtml = reconstructedHtml.replace(placeholderRegex, replacement);
    }
  });
  
  return reconstructedHtml;
}

// Universal content reconstruction
function reconstructUniversalContent(html, content) {
  console.log('🎨 Reconstructing universal content...');
  let reconstructedHtml = html;
  
  // Platform-specific cleanup
  switch (content.platform) {
    case 'shopify':
      reconstructedHtml = cleanupShopify(reconstructedHtml);
      break;
    case 'wordpress':
      reconstructedHtml = cleanupWordpress(reconstructedHtml);
      break;
    case 'custom':
      reconstructedHtml = cleanupCustom(reconstructedHtml);
      break;
  }
  
  // Reconstruct videos
  content.videos.forEach((video, index) => {
    const placeholder = `<!-- VIDEO_PLACEHOLDER_${index} -->`;
    let replacement = '';
    
    switch (video.type) {
      case 'youtube':
        replacement = `<div class="video-container" style="position: relative; width: 100%; height: 0; padding-bottom: 56.25%;">
          <iframe src="https://www.youtube.com/embed/${video.id}?rel=0" 
                  style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;" 
                  frameborder="0" allowfullscreen></iframe>
        </div>`;
        break;
        
      case 'vimeo':
        replacement = `<div class="video-container" style="position: relative; width: 100%; height: 0; padding-bottom: 56.25%;">
          <iframe src="https://player.vimeo.com/video/${video.id}" 
                  style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;" 
                  frameborder="0" allowfullscreen></iframe>
        </div>`;
        break;
        
      case 'wistia':
        replacement = `<div class="video-container" style="position: relative; width: 100%; height: 0; padding-bottom: 56.25%;">
          <iframe src="https://fast.wistia.net/embed/iframe/${video.id}" 
                  style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;" 
                  frameborder="0" allowfullscreen></iframe>
        </div>`;
        break;
        
      case 'html5':
        replacement = `<video controls style="width: 100%; max-width: 100%;"${video.poster ? ` poster="${video.poster}"` : ''}>
          <source src="${video.src}" type="video/mp4">
          Your browser does not support the video tag.
        </video>`;
        break;
    }
    
    if (replacement) {
      reconstructedHtml = reconstructedHtml.replace(placeholder, replacement);
    }
  });
  
  // Reconstruct carousels with universal carousel library
  if (content.carousels.length > 0) {
    reconstructedHtml = addUniversalCarousel(reconstructedHtml, content.carousels);
  }
  
  // Add universal analytics (for A/B testing)
  reconstructedHtml = addUniversalAnalytics(reconstructedHtml);
  
  // Add universal styling
  reconstructedHtml = addUniversalStyling(reconstructedHtml);
  
  return reconstructedHtml;
}

// Platform-specific cleanup functions
function cleanupShopify(html) {
  // Remove Shopify-specific elements that might interfere
  const shopifySelectors = [
    'script[src*="shopify"]',
    'script[src*="myshopify"]',
    '.shopify-section',
    '#shopify-section',
    '[data-shopify]'
  ];
  
  shopifySelectors.forEach(selector => {
    const regex = new RegExp(`<[^>]*${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^>]*>.*?</[^>]*>`, 'gi');
    html = html.replace(regex, '');
  });
  
  return html;
}

function cleanupWordpress(html) {
  // Remove WordPress-specific elements
  const wpSelectors = [
    'script[src*="wp-content"]',
    'script[src*="wordpress"]',
    '.wp-content',
    '.wp-header',
    '.wp-footer'
  ];
  
  wpSelectors.forEach(selector => {
    const regex = new RegExp(`<[^>]*${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^>]*>.*?</[^>]*>`, 'gi');
    html = html.replace(regex, '');
  });
  
  return html;
}

function cleanupCustom(html) {
  // Remove common tracking and analytics
  const trackingSelectors = [
    'script[src*="google-analytics"]',
    'script[src*="gtag"]',
    'script[src*="facebook"]',
    'script[src*="hotjar"]',
    'script[src*="mixpanel"]'
  ];
  
  trackingSelectors.forEach(selector => {
    const regex = new RegExp(`<[^>]*${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^>]*>.*?</[^>]*>`, 'gi');
    html = html.replace(regex, '');
  });
  
  return html;
}

// Add universal carousel functionality
function addUniversalCarousel(html, carousels) {
  const carouselCSS = `
    <style>
      .universal-carousel {
        position: relative;
        overflow: hidden;
        width: 100%;
      }
      .carousel-container {
        display: flex;
        transition: transform 0.3s ease;
      }
      .carousel-slide {
        flex: 0 0 100%;
        min-width: 100%;
      }
      .carousel-nav {
        position: absolute;
        top: 50%;
        transform: translateY(-50%);
        background: rgba(0,0,0,0.5);
        color: white;
        border: none;
        padding: 10px;
        cursor: pointer;
        z-index: 10;
      }
      .carousel-prev { left: 10px; }
      .carousel-next { right: 10px; }
      .carousel-dots {
        position: absolute;
        bottom: 10px;
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        gap: 5px;
      }
      .carousel-dot {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: rgba(255,255,255,0.5);
        cursor: pointer;
      }
      .carousel-dot.active {
        background: white;
      }
    </style>
  `;
  
  const carouselJS = `
    <script>
      document.addEventListener('DOMContentLoaded', function() {
        const carousels = document.querySelectorAll('.universal-carousel');
        carousels.forEach(carousel => {
          const container = carousel.querySelector('.carousel-container');
          const slides = carousel.querySelectorAll('.carousel-slide');
          const prevBtn = carousel.querySelector('.carousel-prev');
          const nextBtn = carousel.querySelector('.carousel-next');
          const dots = carousel.querySelectorAll('.carousel-dot');
          
          let currentSlide = 0;
          
          function showSlide(index) {
            container.style.transform = \`translateX(-\${index * 100}%)\`;
            dots.forEach((dot, i) => {
              dot.classList.toggle('active', i === index);
            });
            currentSlide = index;
          }
          
          if (prevBtn) prevBtn.addEventListener('click', () => {
            showSlide(currentSlide > 0 ? currentSlide - 1 : slides.length - 1);
          });
          
          if (nextBtn) nextBtn.addEventListener('click', () => {
            showSlide(currentSlide < slides.length - 1 ? currentSlide + 1 : 0);
          });
          
          dots.forEach((dot, index) => {
            dot.addEventListener('click', () => showSlide(index));
          });
          
          // Auto-play
          setInterval(() => {
            showSlide(currentSlide < slides.length - 1 ? currentSlide + 1 : 0);
          }, 5000);
        });
      });
    </script>
  `;
  
  return html.replace('</head>', carouselCSS + '</head>')
             .replace('</body>', carouselJS + '</body>');
}

// Add universal analytics for A/B testing
function addUniversalAnalytics(html) {
  const analyticsScript = `
    <script>
      // Universal analytics for 2nd Half App
      window.secondHalfAnalytics = {
        track: function(event, data) {
          // Send to your analytics endpoint
          fetch('/api/analytics', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ event, data, timestamp: Date.now() })
          });
        },
        
        trackPageView: function() {
          this.track('page_view', {
            url: window.location.href,
            title: document.title
          });
        },
        
        trackClick: function(element, action) {
          this.track('click', {
            element: element.tagName,
            text: element.textContent,
            action: action
          });
        }
      };
      
      // Track page views
      secondHalfAnalytics.trackPageView();
      
      // Track button clicks
      document.addEventListener('click', function(e) {
        if (e.target.matches('button, a, [role="button"]')) {
          secondHalfAnalytics.trackClick(e.target, 'click');
        }
      });
    </script>
  `;
  
  return html.replace('</body>', analyticsScript + '</body>');
}

// Add universal styling
function addUniversalStyling(html) {
  const universalCSS = `
    <style>
      /* Universal responsive design */
      * { box-sizing: border-box; }
      
      body {
        margin: 0;
        padding: 0;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        line-height: 1.6;
      }
      
      /* Responsive images */
      img { max-width: 100%; height: auto; }
      
      /* Responsive videos */
      .video-container {
        position: relative;
        width: 100%;
        height: 0;
        padding-bottom: 56.25%;
      }
      
      .video-container iframe,
      .video-container video {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
      }
      
      /* Mobile-first responsive */
      @media (max-width: 768px) {
        .desktop-only { display: none !important; }
      }
      
      @media (min-width: 769px) {
        .mobile-only { display: none !important; }
      }
      
      /* Universal button styles */
      .btn, button, [role="button"] {
        cursor: pointer;
        border: none;
        padding: 12px 24px;
        border-radius: 4px;
        font-size: 16px;
        text-decoration: none;
        display: inline-block;
        transition: all 0.3s ease;
      }
      
      .btn:hover, button:hover, [role="button"]:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 8px rgba(0,0,0,0.2);
      }
    </style>
  `;
  
  return html.replace('</head>', universalCSS + '</head>');
}

async function extractPageHtml(url, slug = 'preview') {
  console.log('🚀 Starting enhanced page extraction...');
  
  const browser = await puppeteer.launch({
    headless: 'new', // Use new headless mode
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-web-security',
      '--disable-features=VizDisplayCompositor',
      '--disable-gpu',
      '--disable-extensions',
      '--disable-plugins',
      '--disable-images', // Speed up loading by not loading images initially
      '--window-size=1920,1080'
    ],
  });

  try {
    const page = await browser.newPage();
    
    // Set longer timeouts
    page.setDefaultNavigationTimeout(120000); // 2 minutes
    page.setDefaultTimeout(60000); // 1 minute for other operations
    
    await page.setViewport({ width: 1920, height: 1080 });
    
    // Set user agent
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Block heavy resources to speed up loading
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const resourceType = req.resourceType();
      const url = req.url();
      
      // Block unnecessary resources but allow video-related ones
      if (resourceType === 'font' || 
          (resourceType === 'image' && !url.includes('thumbnail') && !url.includes('preview') && !url.includes('poster')) ||
          (resourceType === 'stylesheet' && url.includes('font')) ||
          url.includes('google-analytics') ||
          url.includes('facebook.net') ||
          url.includes('doubleclick') ||
          url.includes('googletagmanager')) {
        req.abort();
      } else {
        req.continue();
      }
    });

    console.log(`⏳ Loading: ${url}`);
    
    try {
      // Try different wait strategies
      await page.goto(url, { 
        waitUntil: 'domcontentloaded', // Less strict than networkidle0
        timeout: 120000 
      });
      
      console.log('✅ Page loaded (domcontentloaded)');
      
      // Wait for widgets with timeout
      await waitForWidgetsToLoad(page, 15000);
      
    } catch (timeoutError) {
      console.log('⚠️  Navigation timeout, but continuing with whatever loaded...');
      // Continue with extraction even if page didn't fully load
    }

    console.log('🔄 Scrolling page to load lazy content...');
    await autoScroll(page);
    
    // Brief wait after scrolling (increase to 7 seconds)
    await new Promise(resolve => setTimeout(resolve, 7000));

    // Wait for <video> elements to appear (up to 10 seconds) - SIMPLE APPROACH FROM WORKING VERSION
    try {
      await page.waitForSelector('video', {timeout: 10000});
      console.log('DEBUG: <video> element(s) appeared on the page.');
    } catch (e) {
      console.log('DEBUG: No <video> elements appeared after waiting.');
    }

    // Force hidden Videowise iframes visible - FROM WORKING VERSION
    await page.addStyleTag({
      content:
        '.lbx-iframe-hide{display:block!important;opacity:1!important} .lbx-iframe-show{opacity:1!important}',
    });

    // Tag every video widget we must freeze - FROM WORKING VERSION
    const tagCount = await page.evaluate(() => {
      let idx = 0;
      document.querySelectorAll('.reeview-app-widget').forEach((el) => {
        el.setAttribute('data-freeze-target', `vw-${idx++}`);
      });
      return idx;
    });
    console.log(`🔎  Freeze targets tagged: ${tagCount}`);

    const targets = await page.$$('[data-freeze-target]');
    console.log(`🔍  Handles retrieved     : ${targets.length}`);

    // Scroll each widget into view individually - FROM WORKING VERSION
    const vpH = await page.evaluate(() => innerHeight);
    for (let i = 0; i < targets.length; i++) {
      const el = targets[i];
      try {
        await el.evaluate((n) => n.scrollIntoView({ block: 'center' }));
        await new Promise(resolve => setTimeout(resolve, 600));

        let box = await el.boundingBox();
        if (!box || box.width < 50 || box.height < 50) {
          console.log(`  • Skip tiny/hidden #${i + 1}`);
          continue;
        }

        if (box.y + box.height > vpH) {
          await page.evaluate(
            (extra) => scrollBy(0, extra),
            box.y + box.height - vpH + 20,
          );
          await new Promise(resolve => setTimeout(resolve, 300));
          box = await el.boundingBox();
        }

        console.log(`  ✅ Scrolled widget #${i + 1} into view`);
      } catch (err) {
        console.log(`  ❌ Error scrolling widget #${i + 1}: ${err.message}`);
      }
    }

    // Additional wait after scrolling all widgets into view
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Debug: Log all video widget IDs and counts before extraction
    await page.evaluate(() => {
      const widgets = Array.from(document.querySelectorAll('.reeview-app-widget'));
      console.log('🛑 DEBUG: Found reeview-app-widget count:', widgets.length);
      widgets.forEach((w, i) => {
        console.log(`🛑 DEBUG: Widget #${i + 1} id=${w.id} innerHTML.length=${w.innerHTML.length}`);
      });
    });

    /* ---------------------  VIDEO CONTENT EXTRACTION  --------------------- */
    console.log('📹 Extracting video content...');
    const videoMetadata = await extractVideoContent(page);
    console.log(`📊 Found ${videoMetadata.length} video elements`);

    /* ------------------------  DOM CLEANUP  ------------------------- */
    console.log('🧹 Cleaning up page DOM...');
    let dirtyHtml = await page.evaluate((baseUrl) => {
      // Remove problematic elements
      const selectorsToKill = [
        '.csm-cookie-consent',
        '#hs-eu-cookie-confirmation',
        '#shopify-section-cart-drawer',
        '#ssloader',
        '#gorgias-chat-container',
        'style[data-emotion="gorgias-chat-key"]',
        '#czvdo-global-style',
        'style#czvdo-global-style',
        '#web-pixels-manager-sandbox-container',
        '#swym-plugin',
        '#swym-container',
        'div[id*="shopify-block-"]:not([data-video-placeholder])',
        'noscript',
        // Remove scripts but keep essential ones
        'script:not([src*="youtube"]):not([src*="vimeo"]):not([src*="wistia"]):not([data-video-placeholder])'
      ];
      document.querySelectorAll(selectorsToKill.join(',')).forEach((n) => n.remove());

      // Make URLs absolute
      const toAbs = (u) => {
        if (!u || u.startsWith('data:') || u.startsWith('http')) return u;
        try { return new URL(u, baseUrl).href; } catch { return u; }
      };
      
      document.querySelectorAll('[href]').forEach((n) => n.setAttribute('href', toAbs(n.getAttribute('href'))));
      document.querySelectorAll('[src]').forEach((n) => n.setAttribute('src', toAbs(n.getAttribute('src'))));

      return '<!DOCTYPE html>\n' + document.documentElement.outerHTML;
    }, url);

    // --- Universal platform/framework detection ---
    const { platform, framework } = detectPlatformFramework(dirtyHtml, url);
    console.log(`🌎 Detected platform: ${platform}`);
    console.log(`⚛️  Detected framework: ${framework}`);
    // --- End universal detection ---

    /* ----------------------  STRING CLEANUP  ------------------------ */
    console.log('🧽 Applying regex cleanup...');
    const cleanupRegexes = {
      encodedCzvdo: /&lt;style id="czvdo-global-style"[\s\S]*?&lt;\/style&gt;/gi,
      normalCzvdo: /<style id="czvdo-global-style"[\s\S]*?<\/style>/gi,
      prefetch: /<link rel="(?:prefetch|preconnect|dns-prefetch)"[^>]*>/gi,
      emptyStyle: /<style>\s*<\/style>/gi,
      shopifyScripts: /<script[^>]*shopify[^>]*>[\s\S]*?<\/script>/gi,
      analyticsScripts: /<script[^>]*(?:google-analytics|gtag|facebook)[\s\S]*?<\/script>/gi
    };

    let cleanHtml = dirtyHtml;
    Object.entries(cleanupRegexes).forEach(([name, regex]) => {
      cleanHtml = cleanHtml.replace(regex, '');
    });

    /* ----------------------  VIDEO RECONSTRUCTION  ---------------------- */
    console.log('🎬 Reconstructing videos...');
    const finalHtml = reconstructVideos(cleanHtml, videoMetadata);
    
    /* -----------------------  WRITE OUTPUT  ------------------------- */
    const outputDir = path.join(__dirname, '../static/landing-pages');
    const outputPath = path.join(outputDir, `${slug}.html`);
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(outputPath, finalHtml, 'utf8');
    
    console.log(`\n✅ Success! Page saved: ${outputPath}`);
    console.log(`📹 Videos reconstructed: ${videoMetadata.length}`);
    console.log(`📊 Page size: ${(finalHtml.length / 1024).toFixed(1)}KB`);
    
    // Log detailed video info
    videoMetadata.forEach((video, i) => {
      if (video.type === 'keen-slide') {
        console.log(`   🎥 #${i + 1} Keen Slider: "${video.title || 'Untitled'}" - ${video.videoUrl ? '✓' : '✗'} video, ${video.thumbnailUrl ? '✓' : '✗'} thumbnail`);
      } else {
        console.log(`   🎥 #${i + 1} ${video.type}: ${video.videoUrls?.length || 0} URLs, ${video.thumbnails?.length || 0} thumbnails`);
      }
    });
    
    return outputPath;
    
  } catch (err) {
    console.error('❌ Error:', err.message);
    if (err.message.includes('timeout')) {
      console.error('💡 Suggestion: The page might be too heavy or have blocking resources.');
      console.error('   Try running the script again or check if the URL is accessible.');
    }
    throw err;
  } finally {
    await browser?.close();
    console.log('🔚 Browser closed.');
  }
}

module.exports = { extractPageHtml };