export function powerMenuPress(armed: PowerAction | null, action: PowerAction, confirmRequired: boolean): PowerMenuPress {
    if (!confirmRequired || armed === action) return { run: action };
    return { armed: action };
}
