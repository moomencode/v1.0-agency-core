import React from 'react'
import { motion } from 'framer-motion'
import SectionHeading from '../components/SectionHeading'
import Card from '../components/Card'
import Button from '../components/Button'
import { SITE } from '../core/site'
import { t } from '../core/i18n'

const { menu, business } = SITE
const currency = business?.currency || { symbol: '', decimals: 0, position: 'after' }

function priceParts(value) {
  const digits = currency.decimals ?? 0
  const number = Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
  const symbol = currency.symbol || currency.code || ''
  return { number, symbol }
}
const categories = menu?.categories || []
const dishesByCategory = menu?.dishes || {}
const heading = menu?.heading || {}
const itemsSuffix = menu?.itemsSuffix || 'Items'

export default function Menu() {
  const [activeCategory, setActiveCategory] = React.useState(categories[0]?.id || '')

  const activeDishes = activeCategory ? dishesByCategory[activeCategory] || [] : []
  const activeLabel = categories.find((c) => c.id === activeCategory)?.label

  if (categories.length === 0) return null

  return (
    <section id="menu" className="py-24 md:py-32 px-5 md:px-10 bg-base">
      <div className="max-w-7xl mx-auto">
        <SectionHeading eyebrow={t(heading.eyebrow)} title={t(heading.title)} />

        {/* Category selector cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 md:gap-5">
          {categories.map((cat, i) => (
            <motion.div
              key={cat.id}
              initial={{ opacity: 0, y: 15 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.3, delay: i * 0.03 }}
            >
              <Card
                image={cat.image}
                title={t(cat.label)}
                subtitle={`${cat.count} ${t(itemsSuffix)}`}
                active={activeCategory === cat.id}
                onClick={() => setActiveCategory(cat.id)}
              />
            </motion.div>
          ))}
        </div>

        {/* Dynamic dish list for the selected category */}
        <div className="mt-14">
          <h3 className="text-center text-ink text-xl md:text-2xl font-serif font-bold tracking-wide mb-8">
            {t(activeLabel)}
          </h3>

          <motion.div
            key={activeCategory}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6"
          >
            {activeDishes.map((dish) => (
              <div
                key={dish.id}
                className="group relative flex items-center gap-4 p-4 md:p-5 rounded-2xl bg-surface/60 border border-ink/10
                  hover:border-primary/40 hover:bg-surface transition-all duration-500 ease-premium shadow-sm hover:shadow-elevated hover:-translate-y-1"
              >
                {/* 1. Dish image */}
                <div className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-xl overflow-hidden shrink-0 bg-base border border-ink/5">
                  <img
                    src={dish.image}
                    alt={t(dish.name)}
                    loading="lazy"
                    className="w-full h-full object-cover transition-transform duration-700 ease-premium group-hover:scale-110"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>

                {/* 2. Dish details */}
                <div className="flex-1 min-w-0 flex flex-col justify-between py-1 h-full">
                  <div>
                    <h4 className="text-ink font-serif font-bold text-base md:text-lg leading-snug group-hover:text-primary transition-colors duration-300 truncate">
                      {t(dish.name)}
                    </h4>

                    {dish.description && (
                      <p className="text-ink/60 text-xs font-sans line-clamp-2 mt-1 leading-relaxed">
                        {t(dish.description)}
                      </p>
                    )}
                  </div>

                  {/* 3. Price and button */}
                  <div className="flex items-center justify-between mt-3 pt-2 border-t border-ink/5">
                    <div className="flex items-baseline gap-1">
                      <span className="text-primary font-serif font-extrabold text-lg md:text-xl">
                        {priceParts(dish.price).number}
                      </span>
                      <span className="text-primary/80 font-sans text-[10px] uppercase font-bold tracking-wider">
                        {priceParts(dish.price).symbol}
                      </span>
                    </div>

                    <button
                      className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center
                        group-hover:bg-primary group-hover:text-base group-active:scale-90 transition-all duration-300 ease-premium shadow-sm font-bold text-lg"
                      aria-label={t(menu?.addAria) || 'View dish details'}
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </motion.div>
        </div>

        {menu?.more?.label && (
          <div className="flex justify-center mt-12">
            <Button
              variant="outline"
              href={menu.more.href && menu.more.href.startsWith('#') ? undefined : menu.more.href}
              onClick={menu.more.href?.startsWith('#')
                ? (e) => {
                    e.preventDefault()
                    document.querySelector(menu.more.href)?.scrollIntoView({ behavior: 'smooth' })
                  }
                : undefined}
            >
              {t(menu.more.label)}
            </Button>
          </div>
        )}
      </div>
    </section>
  )
}
