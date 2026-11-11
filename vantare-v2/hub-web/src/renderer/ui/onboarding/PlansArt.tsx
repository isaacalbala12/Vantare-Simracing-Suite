import launch from "../../assets/onboarding/launch.png?url";
import plus from "../../assets/onboarding/plus.png?url";
import pro from "../../assets/onboarding/pro.png?url";
import { onboardingChoicesText } from "../../i18n/onboarding";
import { onboardingStepsText as text } from "../../i18n/onboarding-pasos";
import { Button } from "../Button";
import "./plans-art.css";
export function PlansArt({
  onPrices,
  pending = false,
}: {
  onPrices: () => void;
  pending?: boolean;
}) {
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
      <div className="v-ob-plans-heading">
        <h2>{text.launchPrice}</h2>
        <span>{text.launchUntil}</span>
      </div>
      <div className="v-ob-plans-row">
        {cards.map((card) => (
          <div className="v-ob-plan" data-plan={card.id} key={card.id}>
            <div className="v-ob-plan-heading">
              <img src={card.image} alt={card.name} aria-hidden="true" />
              <div>
                <h3>{card.name}</h3>
                <small>{text.firstMonth}</small>
              </div>
            </div>
            <div className="v-ob-plan-price">
              <strong>{card.price}</strong>
              <s>
                <span className="v-sr-only">{text.normalPrice}</span>
                {card.normal}
              </s>
            </div>
            {card.features.map((feature) => (
              <p key={feature}>
                {onboardingChoicesText.check} {feature}
              </p>
            ))}
            <Button
              className="v-ob-plan-select"
              aria-description={text.externalPage}
              disabled={pending}
              onClick={onPrices}
            >
              {card.action}
            </Button>
          </div>
        ))}
      </div>
      <Button
        className="v-ob-launch-plan"
        aria-description={text.externalPage}
        disabled={pending}
        onClick={onPrices}
      >
        <img src={launch} alt={text.launchEdition} aria-hidden="true" />
        <span>
          <strong>{text.launchEdition}</strong>
          <span>{text.launchHelp}</span>
        </span>
        <b>{text.launchCost}</b>
      </Button>
      <p className="v-ob-plan-free">{text.freeForever}</p>
    </div>
  );
}
