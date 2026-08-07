export default function App() {
  return (
    <div className="site">
<header className={"nav"} role={"banner"} data-section={"navbar"}>
  <div className={"container"}>
    <nav className={"nav__inner"} aria-label={"Main navigation"}>
      <a className={"nav__brand"} href={"#home"}>
        <img src={"/logo/logo-light.png"} alt={"Delta Logistics Logo"} height={"36"} />
{"DELTA"}
      </a>
      <button className={"nav__toggle"} type={"button"} data-nav-toggle={""} aria-label={"Open menu"} aria-expanded={"false"}>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
      </button>
      <div className={"nav__right"}>
        <ul className={"nav__links"} id={"site-menu"}>
          <li>
            <a className={"nav__link"} aria-label={"Home"} href={"#home"}>
{"Home"}
            </a>
          </li>
          <li>
            <a className={"nav__link"} aria-label={"Why Us"} href={"#features"}>
{"Why Us"}
            </a>
          </li>
          <li>
            <a className={"nav__link"} aria-label={"Stats"} href={"#stats"}>
{"Stats"}
            </a>
          </li>
          <li>
            <a className={"nav__link"} aria-label={"Offers"} href={"#offers"}>
{"Offers"}
            </a>
          </li>
          <li>
            <a className={"nav__link"} aria-label={"Reviews"} href={"#testimonials"}>
{"Reviews"}
            </a>
          </li>
          <li>
            <a className={"nav__link"} aria-label={"Gallery"} href={"#gallery"}>
{"Gallery"}
            </a>
          </li>
          <li>
            <a className={"nav__link"} aria-label={"Menu"} href={"#menu"}>
{"Menu"}
            </a>
          </li>
        </ul>
        <div className={"nav__icon-row"}>
          <button className={"theme-toggle"} type={"button"} data-theme-toggle={""} aria-label={"Toggle dark/light mode"}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z"/></svg>
          </button>
          <span className={"nav__cta"}>
            <a className={"btn btn--primary"} aria-label={"Shop Now"} href={"#contact"}>
{"Shop Now"}
            </a>
          </span>
        </div>
      </div>
    </nav>
  </div>
</header>
<section className={"sec sec--alt"} data-section={"hero"} id={"home"} aria-label={"Introduction"}>
  <div className={"hero__bg"} aria-hidden={"true"}>
    <img src={"/hero/light-hero.jpg"} alt={""} className={"img--cover"} aria-hidden={"true"} />
  </div>
  <div className={"hero__inner"}>
    <div className={"hero__inner"}>
      <div className={"container"}>
        <div className={"hero__grid"}>
          <div>
            <span className={"hero__eyebrow"}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z"/></svg>
{"Welcome to"}
            </span>
            <h1 className={"hero__title"}>
{"DELTA"}
            </h1>
            <p className={"hero__subtitle"}>
{"SHOP"}
            </p>
            <p className={"hero__desc"}>
{"Shop Reach us today."}
            </p>
            <div className={"hero__cta"}>
              <a className={"btn btn--primary"} href={"#menu"}>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 3v8"/><path d="M4 3c0 4 1.5 6 3 8v10"/><path d="M7 3c0 2.5-1 4-1.5 5"/><path d="M17 3v18"/><path d="M17 3c2 2 3 6 3 10h-3"/></svg>
{"View Menu"}
              </a>
              <a className={"btn btn--secondary"} href={"#contact"}>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 4h4l1.5 4L8 10a12 12 0 0 0 6 6l2-2.5 4 1.5v4a2 2 0 0 1-2.2 2A17 17 0 0 1 3 6.2 2 2 0 0 1 5 4z"/></svg>
{"Contact Us"}
              </a>
            </div>
            <div className={"hero__info"}>
              <div className={"hero__info-item"}>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>
                <div>
                  <strong>
{"22 Sudan St"}
                  </strong>
                  <span>
{"Giza"}
                  </span>
                </div>
              </div>
              <div className={"hero__info-item"}>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
                <div>
                  <strong>
{"Open Daily"}
                  </strong>
                  <span>
{"10:00 AM - 11:00 PM"}
                  </span>
                </div>
              </div>
              <div className={"hero__info-item"}>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l2.7 5.6 6.1.8-4.5 4.3 1.1 6-5.4-2.9-5.4 2.9 1.1-6L3.2 9.4l6.1-.8z"/></svg>
                <div>
                  <strong>
{"{rating} Rating"}
                  </strong>
                  <span>
{"(39+ Reviews)"}
                  </span>
                </div>
              </div>
              <div className={"hero__info-item"}>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 6h11v10H2z"/><path d="M13 9h4l3 3v4h-7z"/><circle cx="6.5" cy="18" r="1.8"/><circle cx="17" cy="18" r="1.8"/></svg>
                <div>
                  <strong>
{"Fast Delivery"}
                  </strong>
                  <span>
{"Across the area"}
                  </span>
                </div>
              </div>
            </div>
          </div>
          <div className={"hero__visual"}>
            <img src={"/hero/light-hero.jpg"} alt={"Delta Logistics Ambiance"} className={"img--cover"} />
          </div>
        </div>
      </div>
    </div>
  </div>
</section>
<section className={"sec sec--alt sec--alt"} data-section={"about"} id={"features"} aria-label={"About"}>
  <div className={"container"}>
    <div className={"sec__head"}>
      <span className={"sec__eyebrow"}>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z"/></svg>
{"Why Choose Us"}
      </span>
      <h2 className={"sec__title"}>
{"The Delta Logistics experience"}
      </h2>
    </div>
    <p className={"sec__sub"}>
{"Shop in Giza"}
    </p>
    <div className={"grid grid--3"}>
      <div className={"card--icon"}>
        <span className={"icon-chip"} aria-hidden={"true"}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z"/></svg>
        </span>
        <h3>
{"High local demand (62/100)"}
        </h3>
        <p>
{"opportunity score"}
        </p>
      </div>
      <div className={"card--icon"}>
        <span className={"icon-chip"} aria-hidden={"true"}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z"/></svg>
        </span>
        <h3>
{"Has a live website"}
        </h3>
        <p>
{"website probe"}
        </p>
      </div>
    </div>
  </div>
</section>
<section className={"sec sec--deep sec--alt"} data-section={"stats"} id={"stats"} aria-label={"Statistics"}>
  <div className={"container"}>
    <div className={"sec__head"}>
      <span className={"sec__eyebrow"}>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z"/></svg>
{"By The Numbers"}
      </span>
      <h2 className={"sec__title"}>
{"Our stats"}
      </h2>
    </div>
    <div className={"stats__grid"}>
      <div className={"stat"} id={"stat-rating"}>
        <div className={"stat__value"}>
{"4.1/5"}
        </div>
        <div className={"stat__label"}>
{"Average Rating"}
        </div>
      </div>
      <div className={"stat"} id={"stat-reviews"}>
        <div className={"stat__value"}>
{"39+"}
        </div>
        <div className={"stat__label"}>
{"Reviews"}
        </div>
      </div>
      <div className={"stat"} id={"stat-products"}>
        <div className={"stat__value"}>
{"1500+"}
        </div>
        <div className={"stat__label"}>
{"Products in Stock"}
        </div>
      </div>
      <div className={"stat"} id={"stat-years"}>
        <div className={"stat__value"}>
{"11"}
        </div>
        <div className={"stat__label"}>
{"Years in Business"}
        </div>
      </div>
    </div>
  </div>
</section>
<section className={"sec sec--alt"} data-section={"offers"} id={"offers"} aria-label={"Offers"}>
  <div className={"container"}>
    <div className={"sec__head"}>
      <span className={"sec__eyebrow"}>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z"/></svg>
{"Special Offers"}
      </span>
      <h2 className={"sec__title"}>
{"Don't miss our offers"}
      </h2>
    </div>
    <div className={"offers__grid"}>
      <div className={"offer"}>
        <img src={"/placeholders/image-1.svg"} alt={"Add online booking / reservation flow"} className={"offer__img"} />
        <div className={"offer__body"}>
          <span className={"badge"}>
{"FEATURED"}
          </span>
          <h3>
{"Add online booking / reservation flow"}
          </h3>
          <p className={"offer__desc"}>
{"Add online booking / reservation flow"}
          </p>
          <p className={"offer__time"}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
{" Ongoing"}
          </p>
        </div>
      </div>
      <div className={"offer"}>
        <img src={"/placeholders/image-2.svg"} alt={"Professional photo set (10+ images)"} className={"offer__img"} />
        <div className={"offer__body"}>
          <span className={"badge"}>
{"BEST VALUE"}
          </span>
          <h3>
{"Professional photo set (10+ images)"}
          </h3>
          <p className={"offer__desc"}>
{"Professional photo set (10+ images)"}
          </p>
          <p className={"offer__time"}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
{" Ongoing"}
          </p>
        </div>
      </div>
    </div>
    <p>
      <a className={"btn btn--secondary"} href={"#offers"}>
{"View All Offers"}
      </a>
    </p>
  </div>
</section>
<section className={"sec sec--alt sec--alt"} data-section={"testimonials"} id={"testimonials"} aria-label={"Testimonials"}>
  <div className={"container"}>
    <div className={"sec__head"}>
      <span className={"sec__eyebrow"}>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z"/></svg>
{"Testimonials"}
      </span>
      <h2 className={"sec__title"}>
{"What our clients say"}
      </h2>
    </div>
    <div className={"reviews__grid"}>
      <div className={"review"}>
        <span className={"review__stars"} role={"img"} aria-label={"4 out of 5 stars"}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l2.7 5.6 6.1.8-4.5 4.3 1.1 6-5.4-2.9-5.4 2.9 1.1-6L3.2 9.4l6.1-.8z"/></svg><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l2.7 5.6 6.1.8-4.5 4.3 1.1 6-5.4-2.9-5.4 2.9 1.1-6L3.2 9.4l6.1-.8z"/></svg><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l2.7 5.6 6.1.8-4.5 4.3 1.1 6-5.4-2.9-5.4 2.9 1.1-6L3.2 9.4l6.1-.8z"/></svg><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l2.7 5.6 6.1.8-4.5 4.3 1.1 6-5.4-2.9-5.4 2.9 1.1-6L3.2 9.4l6.1-.8z"/></svg>
        </span>
        <p className={"review__text"}>
{"Consistently excellent. This is my favorite spot now."}
        </p>
        <div>
          <div className={"review__name"}>
{"Dina Samir"}
          </div>
          <div className={"review__role"}>
{"Regular Guest"}
          </div>
        </div>
      </div>
      <div className={"review"}>
        <span className={"review__stars"} role={"img"} aria-label={"4 out of 5 stars"}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l2.7 5.6 6.1.8-4.5 4.3 1.1 6-5.4-2.9-5.4 2.9 1.1-6L3.2 9.4l6.1-.8z"/></svg><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l2.7 5.6 6.1.8-4.5 4.3 1.1 6-5.4-2.9-5.4 2.9 1.1-6L3.2 9.4l6.1-.8z"/></svg><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l2.7 5.6 6.1.8-4.5 4.3 1.1 6-5.4-2.9-5.4 2.9 1.1-6L3.2 9.4l6.1-.8z"/></svg><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l2.7 5.6 6.1.8-4.5 4.3 1.1 6-5.4-2.9-5.4 2.9 1.1-6L3.2 9.4l6.1-.8z"/></svg>
        </span>
        <p className={"review__text"}>
{"A hidden gem. The team really cares about their craft."}
        </p>
        <div>
          <div className={"review__name"}>
{"Omar Farouk"}
          </div>
          <div className={"review__role"}>
{"Long-time Client"}
          </div>
        </div>
      </div>
    </div>
  </div>
</section>
<section className={"sec sec--alt"} data-section={"gallery"} id={"gallery"} aria-label={"Gallery"}>
  <div className={"container"}>
    <div className={"sec__head"}>
      <span className={"sec__eyebrow"}>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z"/></svg>
{"Our Gallery"}
      </span>
      <h2 className={"sec__title"}>
{"A glimpse of our place"}
      </h2>
    </div>
    <div className={"gallery__grid"} role={"list"} aria-label={"More photos"}>
      <figure className={"gallery__item"} id={"gallery-item-1"}>
        <img src={"/placeholders/image-3.svg"} alt={"Gallery photo 1"} className={"img--cover"} />
        <figcaption>
{"Gallery photo 1"}
        </figcaption>
      </figure>
      <figure className={"gallery__item"} id={"gallery-item-2"}>
        <img src={"/placeholders/image-4.svg"} alt={"Gallery photo 2"} className={"img--cover"} />
        <figcaption>
{"Gallery photo 2"}
        </figcaption>
      </figure>
      <figure className={"gallery__item"} id={"gallery-item-3"}>
        <img src={"/placeholders/image-5.svg"} alt={"Gallery photo 3"} className={"img--cover"} />
        <figcaption>
{"Gallery photo 3"}
        </figcaption>
      </figure>
      <figure className={"gallery__item"} id={"gallery-item-4"}>
        <img src={"/placeholders/image-6.svg"} alt={"Gallery photo 4"} className={"img--cover"} />
        <figcaption>
{"Gallery photo 4"}
        </figcaption>
      </figure>
    </div>
  </div>
</section>
<section className={"sec sec--alt"} data-section={"menu"} id={"menu"} aria-label={"Menu"}>
  <div className={"container"}>
    <div className={"sec__head"}>
      <span className={"sec__eyebrow"}>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z"/></svg>
{"Our Menu"}
      </span>
      <h2 className={"sec__title"}>
{"What are you craving?"}
      </h2>
    </div>
    <div className={"menu__cat"} />
    <p className={"sec__sub"}>
      <a className={"btn btn--secondary"} href={"#menu"}>
{"View Full Menu"}
      </a>
    </p>
  </div>
</section>
<section className={"sec sec--alt"} data-section={"contact"} id={"contact"} aria-label={"Contact"}>
  <div className={"container"}>
    <div className={"sec__head"}>
      <span className={"sec__eyebrow"}>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z"/></svg>
{"Get in touch"}
      </span>
      <h2 className={"sec__title"}>
{"Contact us"}
      </h2>
    </div>
    <div className={"contact__grid"}>
      <div>
        <div className={"contact__row"}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 4h4l1.5 4L8 10a12 12 0 0 0 6 6l2-2.5 4 1.5v4a2 2 0 0 1-2.2 2A17 17 0 0 1 3 6.2 2 2 0 0 1 5 4z"/></svg>
          <div>
            <strong>
{"Phone"}
            </strong>
            <span>
{"+20 23 777 888"}
            </span>
          </div>
        </div>
        <div className={"contact__row"}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 11.5a8.5 8.5 0 0 1-12.4 7.5L3 21l2-5.6A8.5 8.5 0 1 1 21 11.5z"/></svg>
          <div>
            <strong>
{"WhatsApp"}
            </strong>
            <span>
{"+20 23 777 888"}
            </span>
          </div>
        </div>
        <div className={"contact__row"}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>
          <div>
            <strong>
{"Email"}
            </strong>
            <span>
{"ops@deltalogistics.example"}
            </span>
          </div>
        </div>
        <div className={"contact__row"}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>
          <div>
            <strong>
{"Address"}
            </strong>
            <span>
{"22 Sudan St, Giza"}
            </span>
          </div>
        </div>
        <div className={"contact__row"}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
          <div>
            <strong>
{"Hours"}
            </strong>
            <span>
{"Monday - Sunday: 10:00 AM - 10:00 PM"}
            </span>
          </div>
        </div>
        <div>
          <a className={"nav__link"} aria-label={"whatsapp"} rel={"noopener noreferrer"} target={"_blank"} href={"https://wa.me/201000000014"}>
{"whatsapp"}
          </a>
        </div>
      </div>
      <div>
        <strong>
{"Find us on the map"}
        </strong>
        <a aria-label={"Open map in new tab"} rel={"noopener noreferrer"} target={"_blank"} href={"https://maps.google.com/?q=Giza"}>
          <img src={"/backgrounds/map-dark.png"} alt={"Map"} className={"img--cover map-frame"} width={"600"} height={"320"} />
        </a>
      </div>
    </div>
  </div>
</section>
<section className={"sec sec--alt sec--alt"} data-section={"location"} id={"location"} aria-label={"Location"}>
  <div className={"container"}>
    <div className={"sec__head"}>
      <span className={"sec__eyebrow"}>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z"/></svg>
{"Visit us"}
      </span>
      <h2 className={"sec__title"}>
{"Our location"}
      </h2>
    </div>
    <div className={"contact__grid"}>
      <div>
        <div className={"contact__row"}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>
          <div>
            <strong>
{"Address"}
            </strong>
            <span>
{"22 Sudan St, Giza"}
            </span>
          </div>
        </div>
        <div className={"contact__row"}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>
          <div>
            <strong>
{"Area"}
            </strong>
            <span>
{"Giza"}
            </span>
          </div>
        </div>
        <div className={"contact__row"}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
          <div>
            <strong>
{"Opening Hours"}
            </strong>
            <ul className={"contact__hours"}>
              <li>
                <span>
{"Monday - Sunday"}
                </span>
                <span>
{"10:00 AM - 10:00 PM"}
                </span>
              </li>
            </ul>
          </div>
        </div>
        <a className={"btn btn--secondary"} href={"https://maps.google.com/?q=Giza"} rel={"noopener noreferrer"} target={"_blank"}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>
{"Get Directions"}
        </a>
      </div>
      <a aria-label={"Open map in new tab"} rel={"noopener noreferrer"} target={"_blank"} href={"https://maps.google.com/?q=Giza"}>
        <img src={"/backgrounds/map-dark.png"} alt={"Map to 22 Sudan St, Giza"} className={"map-frame"} width={"600"} height={"320"} />
      </a>
    </div>
  </div>
</section>
<section className={"sec sec--alt"} data-section={"cta"} id={"cta"} aria-label={"Call to action"}>
  <div className={"cta"}>
    <div className={"container"}>
      <div className={"cta__inner"}>
        <h2 className={"cta__title"}>
{"Shop in Giza"}
        </h2>
        <div className={"cta__actions"}>
          <a className={"btn btn--primary"} href={"#contact"}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 7h12l1 14H5z"/><path d="M9 10V6a3 3 0 0 1 6 0v4"/></svg>
{"Shop Now"}
          </a>
          <a className={"btn btn--secondary"} href={"tel:+2023777888"}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 4h4l1.5 4L8 10a12 12 0 0 0 6 6l2-2.5 4 1.5v4a2 2 0 0 1-2.2 2A17 17 0 0 1 3 6.2 2 2 0 0 1 5 4z"/></svg>
{"Call Us"}
          </a>
        </div>
      </div>
    </div>
  </div>
</section>
<footer className={"footer"} id={"footer"} role={"contentinfo"} data-section={"footer"}>
  <div className={"container"}>
    <div className={"footer__grid"}>
      <div>
        <div className={"footer__brand"}>
{"DELTA"}
        </div>
        <p>
{"Delta Logistics — Shop, serving Giza."}
        </p>
      </div>
      <div>
        <div className={"footer__title"}>
{"Quick Links"}
        </div>
        <ul className={"footer__links"}>
          <li>
            <a href={"#home"}>
{"Home"}
            </a>
          </li>
          <li>
            <a href={"#features"}>
{"Why Us"}
            </a>
          </li>
          <li>
            <a href={"#stats"}>
{"Stats"}
            </a>
          </li>
          <li>
            <a href={"#offers"}>
{"Offers"}
            </a>
          </li>
          <li>
            <a href={"#testimonials"}>
{"Reviews"}
            </a>
          </li>
          <li>
            <a href={"#gallery"}>
{"Gallery"}
            </a>
          </li>
          <li>
            <a href={"#menu"}>
{"Menu"}
            </a>
          </li>
        </ul>
      </div>
      <div>
        <div className={"footer__title"}>
{"Contact Us"}
        </div>
        <ul className={"footer__links"}>
          <li>
{"+20 23 777 888"}
          </li>
          <li>
            <a href={"mailto:ops@deltalogistics.example"}>
{"ops@deltalogistics.example"}
            </a>
          </li>
          <li>
{"22 Sudan St, Giza"}
          </li>
        </ul>
        <div className={"footer__links"}>
          <a aria-label={"whatsapp profile"} rel={"noopener noreferrer"} target={"_blank"} href={"https://wa.me/201000000014"}>
{"whatsapp"}
          </a>
        </div>
      </div>
      <div>
        <div className={"footer__title"}>
{"Opening Hours"}
        </div>
        <ul className={"footer__links"}>
          <li>
{"Monday - Sunday: 10:00 AM - 10:00 PM"}
          </li>
        </ul>
      </div>
    </div>
    <div className={"footer__bottom"}>
      <span>
{"© Delta Logistics All rights reserved."}
      </span>
      <span>
{"Built with AgencyOS Website Engine"}
      </span>
    </div>
  </div>
</footer>
    </div>
  );
}
