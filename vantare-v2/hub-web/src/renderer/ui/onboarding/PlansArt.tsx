import plus from "../../assets/onboarding/plus.png?url";
import pro from "../../assets/onboarding/pro.png?url";
import { onboardingChoicesText } from "../../i18n/onboarding";
import { onboardingStepsText as text } from "../../i18n/onboarding-pasos";
import { Button } from "../Button";
import { launchBannerDay, launchEndsAt } from "./launch-offer";
import "./plans-art.css";
export function PlansArt({
  onPrices,
  onPro,
  proDescription,
  proPending = false,
  pending = false,
  now = () => new Date(),
  endsAt = launchEndsAt,
}: {
  onPrices: () => void;
  onPro?: () => void;
  proDescription?: string;
  proPending?: boolean;
  pending?: boolean;
  now?: () => Date;
  endsAt?: string;
}) {
  const bannerDay = launchBannerDay(now(), endsAt);
  // Sin el título del banner, cada plan sube a h2 para no saltar un nivel.
  const PlanName = bannerDay ? "h3" : "h2";
  const cards = [
    {
      id: "pro",
      name: text.pro,
      image: pro,
      price: text.proPrice,
      normal: text.proNormal,
      features: text.proFeatures,
      action: text.choosePro,
    },
    {
      id: "plus",
      name: text.plus,
      image: plus,
      price: text.plusPrice,
      normal: text.plusNormal,
      features: text.plusFeatures,
      action: text.choosePlus,
    },
  ];
  return (
    <div className="v-ob-plans">
      {bannerDay && (
        <div className="v-ob-plans-heading">
          <h2>{text.launchPrice}</h2>
          <span>{text.launchUntil(bannerDay)}</span>
        </div>
      )}
      <div className="v-ob-plans-row">
        {cards.map((card) => (
          <div className="v-ob-plan" data-plan={card.id} key={card.id}>
            <div className="v-ob-plan-heading">
              <img src={card.image} alt={card.name} aria-hidden="true" />
              <div>
                <PlanName>{card.name}</PlanName>
                {bannerDay && <small>{text.firstMonth}</small>}
              </div>
            </div>
            <div className="v-ob-plan-price">
              <strong>{bannerDay ? card.price : card.normal}</strong>
              {bannerDay && (
                <s>
                  <span className="v-sr-only">{text.normalPrice}</span>
                  {card.normal}
                </s>
              )}
            </div>
            {card.features.map((feature) => (
              <p key={feature}>
                <span aria-hidden="true">{onboardingChoicesText.check}</span>
                {feature}
              </p>
            ))}
            <Button
              className="v-ob-plan-select"
              aria-description={
                card.id === "pro"
                  ? (proDescription ?? text.externalPage)
                  : text.externalPage
              }
              disabled={pending || (card.id === "pro" && proPending)}
              onClick={card.id === "pro" ? (onPro ?? onPrices) : onPrices}
            >
              {card.action}
            </Button>
          </div>
        ))}
      </div>
      <p className="v-ob-plan-free">{text.freeForever}</p>
    </div>
  );
}
