<template>
  <div id="app" class="min-h-screen flex items-center justify-center p-5">
    <div class="bg-card-bg rounded-3xl p-10 shadow-2xl text-center max-w-[700px] w-full animate-slide-up border border-primary/15">
      <!-- Logo -->
      <img 
        src="https://thetvdb.com/images/logo.svg" 
        alt="TVDB Logo" 
        class="max-w-56 h-auto mx-auto mb-8 drop-shadow-md"
        width="220" 
        height="94" 
        decoding="async"
      >
      
      <!-- Title and Version -->
      <h1 class="text-white text-[2.5rem] mb-3 font-bold drop-shadow-md">{{ appConfig.ui?.title || 'TVDB Addon' }}</h1>
      <div class="text-primary-light text-[1rem] mb-8 font-light tracking-wide">
        Version {{ version }}
      </div>
      
      <!-- Description -->
      <div class="text-gray-300 text-[1.2rem] leading-relaxed mb-10">
        {{ appConfig.ui?.description || 'Loading...' }}
      </div>

      <!-- Features -->
      <div class="bg-card-secondary rounded-2xl p-8 mb-10 border border-primary/10">
        <h3 class="text-primary mb-5 text-[1.3rem] flex items-center justify-center gap-3">
          <i class="fas fa-star"></i> What You'll Get
        </h3>
        <ul class="grid grid-cols-1 md:grid-cols-3 gap-5 list-none">
          <li 
            v-for="feature in appConfig.ui?.features || ['Movies', 'TV Series', 'Anime']" 
            :key="feature"
            class="bg-card-tertiary p-5 rounded-xl shadow-lg transition-all duration-300 hover:-translate-y-1 hover:shadow-custom-hover border border-primary/10"
          >
            <i :class="getFeatureIcon(feature)" class="text-primary text-[2rem] mb-3 block"></i>
            <span class="text-white font-semibold">{{ feature }}</span>
          </li>
        </ul>
      </div>

      <!-- Language Configuration -->
      <div class="my-8 p-6 bg-card-secondary rounded-2xl shadow-lg border border-primary/10">
        <div class="mb-5">
          <label for="languageSelect" class="font-semibold text-[16px] text-white mb-2 flex items-center justify-start gap-2">
            <i class="fas fa-globe"></i> Preferred Language
            <span class="info-tooltip" data-tooltip="Choose your preferred language for metadata. If not available, will fallback to English, then first available language.">
              <i class="fas fa-info-circle"></i>
            </span>
          </label>
          <div class="select-wrapper">
            <select 
              id="languageSelect" 
              v-model="selectedLanguage"
              @change="saveLanguage"
              class="language-select w-full"
            >
              <option value="eng">English - Default</option>
              <option value="fra">Français (French)</option>
              <option value="spa">Español (Spanish)</option>
              <option value="deu">Deutsch (German)</option>
              <option value="ita">Italiano (Italian)</option>
              <option value="por">Português (Portuguese)</option>
              <option value="jpn">日本語 (Japanese)</option>
              <option value="kor">한국어 (Korean)</option>
              <option value="chi">中文 (Chinese)</option>
              <option value="rus">Русский (Russian)</option>
              <option value="ara">العربية (Arabic)</option>
            </select>
          </div>
        </div>
      </div>
      
      <!-- Advanced Configuration Toggle -->
      <div 
        v-if="appConfig.features?.advancedConfig"
        @click="toggleAdvanced"
        class="flex items-center justify-between bg-card-tertiary p-4 rounded-xl cursor-pointer transition-all duration-300 hover:bg-card-secondary border border-primary/10"
        :class="{ 'active': showAdvanced }"
      >
        <span class="font-semibold text-white text-[1.1rem] flex items-center gap-3">
          <i class="fas fa-cog"></i> Advanced Configuration
        </span>
        <i class="fas fa-chevron-down transition-transform duration-300" :class="{ 'rotate-180': showAdvanced }"></i>
      </div>
      
      <!-- Advanced Container -->
      <div 
        v-if="appConfig.features?.advancedConfig"
        ref="advancedContainer"
        class="bg-card-secondary rounded-b-2xl overflow-hidden transition-all duration-400 ease-out -mt-2"
        :class="showAdvanced ? 'max-h-screen p-6 pt-6' : 'max-h-0'"
      >
        <h2 class="text-primary my-4 text-left text-[1.4rem] flex items-center gap-3">
          <i class="fas fa-sliders-h"></i> Catalog Configuration
        </h2>
        <p class="text-primary-light mb-3 text-left text-[0.9rem]">
          Customize which catalogs appear in Stremio. Reorder using drag and drop or the arrow buttons.
        </p>
        
        <!-- Tabs -->
        <div class="catalog-tabs">
          <button 
            v-for="tab in tabs" 
            :key="tab.id"
            @click="setActiveTab(tab.id)"
            :class="['catalog-tab', { active: activeTab === tab.id }]"
          >
            <i :class="tab.icon"></i> {{ tab.name }}
          </button>
        </div>
        
        <div class="bg-primary/10 border-l-4 border-primary p-3 rounded-r-lg my-4 text-left text-[0.9rem]">
          <i class="fas fa-info-circle"></i>
          Customize your catalogs. Drag to reorder or use the arrow buttons.
        </div>

        <!-- Tab Contents -->
        <div v-for="tab in tabs" :key="tab.id" v-show="activeTab === tab.id" class="animate-fade-in">
          <CatalogConfig 
            :type="tab.id"
            :catalogs="catalogConfigs[tab.id]"
            @update-order="updateOrder"
            @update-toggle="updateToggle"
          />
        </div>
      </div>

      <!-- Install Button -->
      <div class="install-container">
        <button 
          @click="handleInstall"
          class="install-btn"
          :disabled="isInstalling"
        >
          <i :class="isInstalling ? 'fas fa-spinner fa-spin' : 'fas fa-download'"></i>
          {{ isInstalling ? 'Opening...' : 'Install Addon' }}
        </button>
        <button 
          @click="toggleDropdown"
          class="install-dropdown-btn"
        >
          <i class="fas fa-chevron-down"></i>
        </button>
        
        <!-- Dropdown Menu -->
        <div 
          v-show="showDropdown"
          class="dropdown-menu"
          :class="{ 'dropdown-up': shouldShowDropdownUp }"
        >
          <a 
            v-for="item in dropdownItems" 
            :key="item.action"
            @click.prevent="handleInstallAction(item.action)"
            href="#" 
            class="dropdown-item"
          >
            <i :class="item.icon"></i> {{ item.text }}
          </a>
        </div>
      </div>

      <!-- GitHub Link -->
      <div class="mt-8 text-center">
        <a 
          href="https://github.com/NepiRaw/Stremio-TVDB-addon" 
          target="_blank" 
          class="github-badge"
        >
          <i class="fab fa-github"></i>
          <span>View on GitHub</span>
        </a>
      </div>
    </div>

    <!-- Notification -->
    <Notification 
      :show="notification.show"
      :text="notification.text"
    />
  </div>
</template>

<script>
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import CatalogConfig from './components/CatalogConfig.vue'
import Notification from './components/Notification.vue'

export default {
  name: 'App',
  components: {
    CatalogConfig,
    Notification
  },
  setup() {
    const version = ref('Loading...')
    const selectedLanguage = ref('eng')
    const showAdvanced = ref(false)
    const activeTab = ref('movies')
    const showDropdown = ref(false)
    const isInstalling = ref(false)
    const shouldShowDropdownUp = ref(false)
    const manifestUrlTemplate = ref('')
    
    const appConfig = ref({})
    
    const notification = reactive({
      show: false,
      text: ''
    })

    const tabs = [
      { id: 'movies', name: 'Movies', icon: 'fas fa-film' },
      { id: 'series', name: 'TV Series', icon: 'fas fa-tv' },
      { id: 'anime', name: 'Anime', icon: 'fas fa-dragon' }
    ]

    const dropdownItems = [
      { action: 'install', icon: 'fas fa-desktop', text: 'Install for Desktop' },
      { action: 'web', icon: 'fas fa-window-maximize', text: 'Install for Web' },
      { action: 'copy', icon: 'fas fa-copy', text: 'Copy Manifest URL' }
    ]

    const catalogConfigs = reactive({
      movies: [],
      series: [],
      anime: []
    })

    const getFeatureIcon = (feature) => {
      const iconMap = {
        'Movies': 'fas fa-film',
        'TV Series': 'fas fa-tv', 
        'Anime': 'fas fa-dragon',
        'Catalog Browsing': 'fas fa-th-large'
      }
      return iconMap[feature] || 'fas fa-star'
    }

    const loadAppConfig = async () => {
      try {
        const response = await fetch('/api/app-config');
        if (response.ok) {
          const config = await response.json();
          appConfig.value = config;
          version.value = config.version;
          manifestUrlTemplate.value = config.manifestUrlTemplate;
          if (config.ui && config.ui.title) {
            document.title = config.ui.title + ' - Stremio Addon';
          }
          if (config.features?.advancedConfig) {
            await loadCatalogConfig();
          } else {
            flushCatalogConfigStorage();
            catalogConfigs.movies = [];
            catalogConfigs.series = [];
            catalogConfigs.anime = [];
          }
        } else {
          console.warn('Failed to load app config');
          version.value = 'Unknown';
          appConfig.value = { ui: { title: 'TVDB Addon', description: 'Loading...' } };
          document.title = 'TVDB Addon - Stremio Addon';
        }
      } catch (error) {
        console.error('Error loading app config:', error);
        version.value = 'Error';
        appConfig.value = { ui: { title: 'TVDB Addon', description: 'Error loading configuration' } };
        document.title = 'TVDB Addon - Stremio Addon';
      }
    }

    const loadCatalogConfig = async () => {
      try {
        const response = await fetch('/api/catalog-defaults');
        if (response.ok) {
          const sharedConfig = await response.json();
          
          catalogConfigs.movies = sharedConfig.movieCatalogs?.map(catalog => ({
            ...catalog,
            icon: getIconForCategory(catalog.id),
            tooltip: getTooltipForCatalog(catalog.id, 'movie')
          })) || [];
          
          catalogConfigs.series = sharedConfig.seriesCatalogs?.map(catalog => ({
            ...catalog,
            icon: getIconForCategory(catalog.id),
            tooltip: getTooltipForCatalog(catalog.id, 'series')
          })) || [];
          
          console.log('📋 Loaded catalog configuration');
        } else {
          console.warn('Failed to load catalog config');
        }
      } catch (error) {
        console.error('Error loading catalog config:', error);
      }
    }

    const getIconForCategory = (catalogId) => {
      const iconMap = {
        'tmdb-popular': 'fas fa-chart-line',
        'tmdb-trending': 'fas fa-fire', 
        'tmdb-top-rated': 'fas fa-trophy',
        'tvdb-popular': 'fas fa-chart-line',
        'tvdb-trending': 'fas fa-fire',
        'tvdb-latest': 'fas fa-clock',
        'kitsu-trending': 'fas fa-fire',
        'kitsu-popular': 'fas fa-chart-line',
        'jikan-top': 'fas fa-trophy'
      };
      return iconMap[catalogId] || 'fas fa-film';
    }

    const getTooltipForCatalog = (catalogId, type) => {
      const tooltipMap = {
        'tmdb-popular': `Most popular ${type}s from TMDB`,
        'tmdb-trending': `Trending ${type}s from TMDB`,
        'tmdb-top-rated': `Top rated ${type}s from TMDB`,
        'tvdb-popular': `Popular ${type}s from TVDB`,
        'tvdb-trending': `Trending ${type}s from TVDB`,
        'tvdb-latest': `Latest ${type}s from TVDB`,
        'kitsu-trending': `Trending anime from Kitsu`,
        'kitsu-popular': `Popular anime from Kitsu`,
        'jikan-top': `Top anime from MyAnimeList`
      };
      return tooltipMap[catalogId] || `Browse ${type}s in this category.`;
    }

    const getStorageKey = (type, key) => `tvdb-addon-${type}-${key}`

    const saveLanguage = () => {
      localStorage.setItem('tvdb-addon-language', selectedLanguage.value)
    }

    const advancedContainer = ref(null)
    const toggleAdvanced = () => {
      showAdvanced.value = !showAdvanced.value
      localStorage.setItem('tvdb-addon-advanced-open', showAdvanced.value)
      if (showAdvanced.value) {
        setTimeout(() => {
          if (advancedContainer.value) {
            const containerTop = advancedContainer.value.getBoundingClientRect().top
            const scrollPosition = window.scrollY + containerTop - 30
            window.scrollTo({
              top: scrollPosition,
              behavior: 'smooth'
            })
          }
        }, 350)
      }
    }

    const setActiveTab = (tabId) => {
      activeTab.value = tabId
      localStorage.setItem('tvdb-addon-active-tab', tabId)
    }

    const toggleDropdown = (e) => {
      e.stopPropagation()
      
      if (!showDropdown.value) {
        const button = e.currentTarget
        const buttonRect = button.getBoundingClientRect()
        const dropdownHeight = 150 // Approximate height of dropdown
        const spaceBelow = window.innerHeight - buttonRect.bottom
        
        shouldShowDropdownUp.value = spaceBelow < dropdownHeight
      }
      
      showDropdown.value = !showDropdown.value
    }

    const handleInstall = () => {
      handleInstallAction('install')
    }

    const handleInstallAction = (action) => {
      const manifestUrl = getManifestUrl()
      const manifestHost = manifestUrl.replace(/^https?:\/\//, '')

      const actions = {
        install: () => window.location.href = `stremio://${manifestHost}`,
        web: () => window.open(`https://web.strem.io/#/?addon=${encodeURIComponent(manifestUrl)}`, '_blank'),
        copy: () => {
          navigator.clipboard.writeText(manifestUrl)
          showNotification('Manifest URL copied!')
        }
      }

      if (actions[action]) {
        if (action !== 'copy') {
          isInstalling.value = true
          setTimeout(() => {
            isInstalling.value = false
          }, 3000)
        }
        actions[action]()
      }
      
      showDropdown.value = false
    }

    const getManifestUrl = () => {
      if (!manifestUrlTemplate.value) return ''
            
      let url = manifestUrlTemplate.value.replace('{{LANG}}', selectedLanguage.value)
      
      if (appConfig.value.features?.advancedConfig) {
        const configString = generateConfigString()
        if (configString) {
          url += `?config=${encodeURIComponent(configString)}`
        }
      } 
      return url
    }

    const generateConfigString = () => {
      if (!appConfig.value.features?.advancedConfig) {
        return ''
      }
      
      // Additional safety check - if catalogConfigs is empty, don't generate config
      const totalCatalogs = Object.values(catalogConfigs).reduce((sum, catalogs) => sum + catalogs.length, 0);
      if (totalCatalogs === 0) {
        return ''
      }
            
      const configs = []
      Object.keys(catalogConfigs).forEach(type => {
        catalogConfigs[type].forEach((catalog, index) => {
          if (catalog.enabled) {
            const order = catalog.order || (index + 1)
            configs.push(`${catalog.id}:${order}`)
          }
        })
      })
      
      return configs.join(',')
    }

    const showNotification = (text) => {
      notification.text = text
      notification.show = true
      setTimeout(() => {
        notification.show = false
      }, 3000)
    }

    const updateOrder = (type, newOrder) => {
      catalogConfigs[type] = newOrder
      localStorage.setItem(getStorageKey(type, 'order'), JSON.stringify(newOrder.map(item => item.id)))
    }

    const updateToggle = (type, catalogId, enabled) => {
      const catalog = catalogConfigs[type].find(c => c.id === catalogId)
      if (catalog) {
        catalog.enabled = enabled
      }
      saveToggleStates()
    }

    const saveToggleStates = () => {
      Object.keys(catalogConfigs).forEach(type => {
        const config = {}
        catalogConfigs[type].forEach(catalog => {
          config[catalog.id] = catalog.enabled
        })
        localStorage.setItem(getStorageKey(type, 'toggles'), JSON.stringify(config))
      })
    }

    const flushCatalogConfigStorage = () => {
      const keysToRemove = []
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key && (key.includes('tvdb-addon-movies-') || key.includes('tvdb-addon-series-') || key.includes('tvdb-addon-anime-'))) {
          keysToRemove.push(key)
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key))
      
      localStorage.removeItem('tvdb-addon-advanced-open')
      localStorage.removeItem('tvdb-addon-active-tab')
    }

    const loadInitialState = () => {
      selectedLanguage.value = localStorage.getItem('tvdb-addon-language') || 'eng'
      
      if (appConfig.value.features?.advancedConfig) {
        showAdvanced.value = localStorage.getItem('tvdb-addon-advanced-open') === 'true'
        
        activeTab.value = localStorage.getItem('tvdb-addon-active-tab') || 'movies'
        
        Object.keys(catalogConfigs).forEach(type => {
          const savedToggles = JSON.parse(localStorage.getItem(getStorageKey(type, 'toggles')) || '{}')

          catalogConfigs[type].forEach(catalog => {
            if (savedToggles.hasOwnProperty(catalog.id)) {
              catalog.enabled = savedToggles[catalog.id];
            } else {
              catalog.enabled = catalog.enabled ?? true;
            }
          });
          
          const savedOrder = JSON.parse(localStorage.getItem(getStorageKey(type, 'order')) || '[]')
          if (savedOrder.length > 0) {
            const orderedCatalogs = []
            savedOrder.forEach(id => {
              const catalog = catalogConfigs[type].find(c => c.id === id)
              if (catalog) {
                orderedCatalogs.push(catalog)
              }
            })
            catalogConfigs[type].forEach(catalog => {
              if (!orderedCatalogs.find(c => c.id === catalog.id)) {
                orderedCatalogs.push(catalog)
              }
            })
            catalogConfigs[type] = orderedCatalogs
          }
        })
      } else {
        showAdvanced.value = false
        activeTab.value = 'movies'
      }
    }

    const handleClickOutside = (e) => {
      if (!e.target.closest('.install-container')) {
        showDropdown.value = false
      }
    }

    onMounted(async () => {
      await loadAppConfig()
      loadInitialState()
      document.addEventListener('click', handleClickOutside)
    })

    onUnmounted(() => {
      document.removeEventListener('click', handleClickOutside)
    })

    return {
      version,
      selectedLanguage,
      showAdvanced,
      activeTab,
      showDropdown,
      isInstalling,
      notification,
      tabs,
      dropdownItems,
      catalogConfigs,
      appConfig,
      getFeatureIcon,
      saveLanguage,
      toggleAdvanced,
      setActiveTab,
      toggleDropdown,
      handleInstall,
      handleInstallAction,
      updateOrder,
      updateToggle,
      advancedContainer
    }
  }
}

</script>
<style scoped>
.notification.show {
  transform: translateX(0);
}
.notification {
  transform: translateX(150%);
  transition: transform 0.3s ease;
  position: fixed;
  top: 20px;
  right: 20px;
  background: #00A86B;
  color: white;
  padding: 15px 25px;
  border-radius: 12px;
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.2);
  display: flex;
  align-items: center;
  gap: 10px;
  z-index: 1000;
}
</style>
