import React from "react";

export interface StepItem {
  id: string;
  label: string;
  sublabel?: string;
}

interface StepperProps {
  steps: StepItem[];
  currentStepIndex: number;
}

export const Stepper: React.FC<StepperProps> = ({ steps, currentStepIndex }) => {
  return (
    <div className="stepper-nav" aria-label="Transfer progress stepper">
      {steps.map((step, idx) => {
        const isDone = idx < currentStepIndex;
        const isActive = idx === currentStepIndex;

        return (
          <div
            key={step.id}
            className={`stepper-item ${isActive ? "active" : ""} ${isDone ? "completed" : ""}`}
          >
            <div className="stepper-indicator">
              {isDone ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <span className="stepper-num">{idx + 1}</span>
              )}
            </div>
            <div className="stepper-text">
              <span className="stepper-title">{step.label}</span>
              {step.sublabel && <span className="stepper-sub">{step.sublabel}</span>}
            </div>
            {idx < steps.length - 1 && <div className="stepper-connector" />}
          </div>
        );
      })}
    </div>
  );
};
